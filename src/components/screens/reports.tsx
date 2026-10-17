import Link from "@/components/link";
import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/report-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeNotice } from "@/components/date-range-notice";
import { ALL_DATES } from "@/lib/date-range";
import { SPEND_GROUP_LABELS } from "@/lib/screens/options";
import { REPORTS } from "@/lib/screens/options";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/lib/date-range";
import type { loadReport } from "@/lib/screens/reports";

type Data = NonNullable<Awaited<ReturnType<typeof loadReport>>>;
export type ReportsViewProps = Pick<Data, "by" | "data"> & {
  /** Which report ("key" is reserved by React). */
  reportKey: Data["key"];
  dateRange: DateRange | null;
};

export function ReportsView({ by, data, dateRange, reportKey: key }: ReportsViewProps) {
  const report = REPORTS.find((r) => r.key === key)!;

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ r: key, ...(key === "spend" ? { by } : {}), ...patch });
    return `/reports?${p.toString()}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Purchase analytics for management review. Dates follow the range picked in the top bar; every report exports to Excel." />

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={qs({ r: r.key })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              key === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {report.dated && (
        <DateRangeNotice value={dateRange?.value ?? ALL_DATES} what={key === "grn" ? "receipts" : key === "savings" ? "approved comparisons" : "POs"} />
      )}

      <Card className="gap-0 py-0">
        {key === "spend" && (
          <form className="flex flex-wrap items-end gap-3 border-b px-4 py-3" action="/reports">
            <input type="hidden" name="r" value={key} />
            {key === "spend" && (
              <label className="grid gap-1 text-xs text-muted-foreground">
                Group by
                <select name="by" defaultValue={by} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  {Object.entries(SPEND_GROUP_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
        )}
        <ReportTable
          columns={data.columns}
          rows={data.rows}
          totals={data.totals}
          note={data.note}
          fileName={`${report.label}${report.dated && dateRange ? ` ${dateRange.from} to ${dateRange.to}` : ""}${key === "spend" ? ` by ${SPEND_GROUP_LABELS[by]}` : ""}`}
        />
      </Card>
    </div>
  );
}
