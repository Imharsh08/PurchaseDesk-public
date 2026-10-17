import Link from "@/components/link";
import { SettingsIcon } from "lucide-react";
import { DateRangeNotice } from "@/components/date-range-notice";
import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/report-table";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FMS_HISTORY } from "@/lib/screens/options";
import { ALL_DATES } from "@/lib/date-range";
import { PERIODS as SCORE_PERIODS, doerScorecard, periodRange, stepScorecard, type PeriodKey } from "@/lib/fms-score";
import type { FmsRow } from "@/lib/fms";
import { FMS_STEPS, type StepCode } from "@/lib/fms-steps";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { FmsGrid } from "@/app/(app)/fms/fms-grid";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadFmsScreen } from "@/lib/screens/fms";

const HISTORY = FMS_HISTORY;

type Data = NonNullable<Awaited<ReturnType<typeof loadFmsScreen>>>;
export type FmsViewProps = Pick<Data, "assigned" | "canDo" | "days" | "mine" | "rows" | "tat" | "view"> & {
  period: PeriodKey;
  range: DateRange | null;
  sp: SearchParams;
  user: ScreenUser;
};

export function FmsView({ assigned, canDo, days, mine, period, range, rows, sp, tat, user, view }: FmsViewProps) {

  const tab = (active: boolean) =>
    cn("rounded-md px-3 py-1.5 text-sm", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="space-y-6">
      <PageHeader
        title="FMS tracker"
        description="Every indent step by step — planned time from the TAT, actual time, delay and who did it. Red cells are overdue now."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              <Link href="/fms" className={tab(view === "sheet")}>
                Sheet
              </Link>
              <Link href="/fms?view=score" className={tab(view === "score")}>
                Doer scorecard
              </Link>
            </div>
            {view === "sheet" && !range && (
              <div className="flex rounded-lg border p-0.5">
                <Link href="/fms" className={tab(!days)} title="Indents with a step still pending">
                  Open
                </Link>
                {HISTORY.map((d) => (
                  <Link key={d} href={`/fms?days=${d}`} className={tab(d === days)} title={`Everything raised in the last ${d} days`}>
                    {d}d
                  </Link>
                ))}
              </div>
            )}
            {can(user.roles, "manageSettings") && (
              <Button variant="outline" asChild>
                <Link href="/settings#tat">
                  <SettingsIcon />
                  Set TAT & doers
                </Link>
              </Button>
            )}
          </div>
        }
      />
      {view === "sheet" && <DateRangeNotice value={range?.value ?? ALL_DATES} what="indents raised" />}
      {view === "sheet" ? (
        <FmsGrid
          rows={rows}
          tat={tat}
          canDo={canDo}
          mine={mine}
          assigned={assigned}
          canShortClose={can(user.roles, "cancelPO") || can(user.roles, "receiveGoods")}
          initialStep={FMS_STEPS.find((s) => s.code === sp.step)?.code ?? null}
          initialFilter={sp.show === "mine" || sp.show === "open" || sp.show === "overdue" || sp.show === "all" ? sp.show : null}
        />
      ) : (
        <Scorecard rows={rows} assigned={assigned} period={period} />
      )}
    </div>
  );
}

function Scorecard({ rows, assigned, period }: { rows: FmsRow[]; assigned: Record<StepCode, string[]>; period: PeriodKey }) {
  const range = periodRange(period);
  const people = doerScorecard(rows, assigned, range);
  const steps = stepScorecard(rows, assigned, range);
  const label = `${formatDate(range.from)} – ${formatDate(new Date(range.to.getTime() - 1))}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {SCORE_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/fms?view=score&period=${p.key}`}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              p.key === period ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </Link>
        ))}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>By doer</CardTitle>
          <CardDescription>
            Steps finished in the period (on time vs late against the TAT), and what is pending / overdue with each person right now. Pending steps
            count against the step&apos;s assigned doers.
          </CardDescription>
        </CardHeader>
        <ReportTable
          fileName={`FMS doer scorecard ${label}`}
          columns={[
            { key: "person", label: "Doer" },
            { key: "done", label: "Steps done", type: "number" },
            { key: "onTime", label: "On time", type: "number" },
            { key: "late", label: "Late", type: "number" },
            { key: "onTimePct", label: "On-time %", type: "pct" },
            { key: "avgDelayH", label: "Avg delay when late (h)", type: "number" },
            { key: "pendingNow", label: "Pending now", type: "number" },
            { key: "overdueNow", label: "Overdue now", type: "number" },
          ]}
          rows={people}
        />
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>By step</CardTitle>
          <CardDescription>Where the process slows down.</CardDescription>
        </CardHeader>
        <ReportTable
          fileName={`FMS step scorecard ${label}`}
          columns={[
            { key: "step", label: "Step" },
            { key: "doers", label: "Doers" },
            { key: "done", label: "Done", type: "number" },
            { key: "onTimePct", label: "On-time %", type: "pct" },
            { key: "avgDelayH", label: "Avg delay when late (h)", type: "number" },
            { key: "pendingNow", label: "Pending now", type: "number" },
            { key: "overdueNow", label: "Overdue now", type: "number" },
            { key: "avgOverdueH", label: "Avg overdue (h)", type: "number" },
          ]}
          rows={steps}
        />
      </Card>
    </div>
  );
}
