import Link from "@/components/link";
import { AlertTriangleIcon, ArrowRightIcon, ClockIcon, FileTextIcon, GaugeIcon, MailIcon, ScaleIcon, SendIcon, TimerIcon, TruckIcon, UserCheckIcon, type LucideIcon } from "lucide-react";
import { DashboardSwitch, HomePreference } from "@/components/dashboard-switch";
import { EmptyState } from "@/components/empty-state";
import { POStatusBadge } from "@/components/po-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { POStatus } from "@/generated/prisma/enums";
import { financialYear, greeting, formatINR, formatINRCompact } from "@/lib/format";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { connectGmailHref } from "@/lib/mail-links";
import { poDisplayNumber } from "@/lib/po-status";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ScreenUser } from "@/components/screens/types";
import type { loadDashboard } from "@/lib/screens/dashboard";

const days = (n: number | null) => (n === null ? "—" : n < 1 ? `${Math.round(n * 24)} h` : `${n.toFixed(1)} d`);

type Data = NonNullable<Awaited<ReturnType<typeof loadDashboard>>>;
export type DashboardViewProps = Pick<Data, "awaiting" | "deliveriesPct" | "l" | "myOverdue" | "myTaskCount" | "onTime" | "overdueByDoer" | "overdueByStep" | "s" | "todos" | "topMax" | "totalOverdue"> & {
  today: Date;
  user: ScreenUser;
};

export function DashboardView({ awaiting, deliveriesPct, l, myOverdue, myTaskCount, onTime, overdueByDoer, overdueByStep, s, today, todos, topMax, totalOverdue, user }: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-4 [@media(min-width:80rem)_and_(min-height:50rem)]:h-[calc(100svh-3.5rem-4rem)]">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight" suppressHydrationWarning>
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {totalOverdue ? `${totalOverdue} step${totalOverdue === 1 ? "" : "s"} overdue` : "All steps within TAT"} · {todos.length} item{todos.length === 1 ? "" : "s"} need attention
          </p>
          <DashboardSwitch current="overview" approvals={awaiting + s.bills_to_pass} />
          <HomePreference />
        </div>
      </div>
      {!user.gmailConnected && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
          <MailIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Connect your Gmail so POs, quotation requests and step notifications go out from your own address.</span>
          <Button size="xs" asChild className="ml-auto">
            <a href={connectGmailHref("/")}>Connect Gmail</a>
          </Button>
        </div>
      )}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClockIcon}
          label="Awaiting approval"
          value={String(awaiting)}
          sub={awaiting ? `${s.comparisons_pending} comparison${s.comparisons_pending === 1 ? "" : "s"} · ${s.po_pending_approval + s.amendments_pending} PO / amendment` : "Nothing waiting"}
          href="/quotations"
          highlight={awaiting > 0 && can(user.roles, "approveComparison")}
        />
        <StatCard
          icon={ScaleIcon}
          label="Collecting quotes"
          value={String(s.collecting)}
          sub={s.collecting ? (s.short_of_quotes ? `${s.short_of_quotes} below ${MIN_QUOTATIONS} quotes` : "All have enough quotes") : "No open indents"}
          href="/quotations"
        />
        <StatCard
          icon={SendIcon}
          label="POs to issue or send"
          value={String(s.po_to_issue_send)}
          sub={s.overdue_pos ? `${s.overdue_pos} open PO${s.overdue_pos === 1 ? "" : "s"} past delivery date` : `${formatINRCompact(s.open_value)} open with vendors`}
          href="/purchase-orders"
          warn={s.overdue_pos > 0}
        />
        <StatCard
          icon={FileTextIcon}
          label="Ordered this month"
          value={formatINRCompact(s.month_value)}
          sub={`${s.month_pos} PO${s.month_pos === 1 ? "" : "s"} · FY ${financialYear()}: ${formatINRCompact(s.fy_value)}`}
        />
      </div>

      {/* FMS & cycle time */}
      <Card className="shrink-0 gap-3 py-4">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="min-w-0">
            <CardTitle>FMS — steps & delays</CardTitle>
            <CardDescription className="truncate">Open steps against their TAT, who they are with, and how fast purchase moves.</CardDescription>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/fms?view=score">Doer scorecard</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/fms">
                Open FMS
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={AlertTriangleIcon} label="Steps overdue now" value={String(totalOverdue)} tone={totalOverdue ? "bad" : "good"} href="/fms" />
            <Kpi icon={UserCheckIcon} label="My open steps" value={String(myTaskCount)} sub={myOverdue ? `${myOverdue} overdue` : "none overdue"} tone={myOverdue ? "bad" : undefined} href="/fms" />
            <Kpi icon={GaugeIcon} label="Steps on time (month)" value={onTime.pct === null ? "—" : `${onTime.pct}%`} sub={`${onTime.done} steps done`} tone={onTime.pct === null ? undefined : onTime.pct >= 90 ? "good" : onTime.pct >= 70 ? "warn" : "bad"} href="/fms?view=score&period=this-month" />
            <Kpi icon={TimerIcon} label="Indent → PO issued" value={days(s.days_indent_to_po)} sub="average, last 90 days" />
            <Kpi icon={TruckIcon} label="PO → material received" value={days(s.days_po_to_receipt)} sub={`Indent → receipt ${days(s.days_indent_to_receipt)}`} />
            <Kpi icon={TruckIcon} label="Deliveries on time (month)" value={deliveriesPct === null ? "—" : `${deliveriesPct}%`} sub={`${s.deliveries_on_time} of ${s.deliveries_with_due} receipts`} tone={deliveriesPct === null ? undefined : deliveriesPct >= 90 ? "good" : deliveriesPct >= 70 ? "warn" : "bad"} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Overdue by step</span>
              {overdueByStep.length === 0 ? (
                <span className="text-sm text-emerald-700 dark:text-emerald-400">Nothing overdue</span>
              ) : (
                overdueByStep.map((st) => (
                  <Link key={st.code} href={`/fms?step=${st.code}&show=overdue`} title={`${st.name}: show the overdue ones`} className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">{st.code}</span>
                    <span>{st.short}</span>
                    <span className="rounded-full bg-rose-600 px-1.5 text-xs font-medium text-white">{st.n}</span>
                  </Link>
                ))
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Overdue by doer</span>
              {overdueByDoer.length === 0 ? (
                <span className="text-sm text-muted-foreground">No one</span>
              ) : (
                overdueByDoer.slice(0, 6).map((d) => (
                  <span key={d.person} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm">
                    {d.person}
                    <span className="font-semibold text-rose-600 tabular">{d.overdueNow}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-h-80 xl:[&>*]:min-h-[30rem]">
        <Card className="min-h-0 gap-0 py-0">
          <CardHeader className="border-b py-2.5">
            <CardTitle>Needs your attention</CardTitle>
            <CardDescription>Overdue steps and approvals first, then POs, then quotes.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
            {todos.length === 0 ? (
              <EmptyState icon={FileTextIcon} title="You're all caught up" description="Nothing needs action right now." className="py-8" />
            ) : (
              <ul className="divide-y">
                {todos.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href} className="flex items-center gap-3 px-4 py-1.5 transition-colors hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{t.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${t.tone}`}>{t.tag}</span>
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{t.detail}</div>
                      </div>
                      {t.right && <div className="text-right text-sm font-medium tabular">{t.right}</div>}
                      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0 gap-0 py-0">
          <CardHeader className="border-b py-2.5">
            <CardTitle>Recent purchase orders</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/purchase-orders">
                  View all
                  <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
            {l.recent.length === 0 ? (
              <EmptyState icon={FileTextIcon} title="No purchase orders yet" className="py-8" />
            ) : (
              <ul className="divide-y">
                {l.recent.map((po) => (
                  <li key={po.id}>
                    <Link href={`/purchase-orders/${po.id}`} className="flex items-center gap-3 px-4 py-1.5 transition-colors hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {poDisplayNumber({ id: po.id, poNumber: po.num })}
                          {po.n ? ` Rev. ${po.n}` : ""}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{po.party}</div>
                      </div>
                      <POStatusBadge status={po.status as POStatus} className="hidden sm:inline-flex" />
                      <div className="w-24 text-right text-sm font-medium tabular">{formatINR(po.amount ?? 0)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid min-h-0 gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1 xl:grid-rows-2 [&>*]:min-h-0">
          <Card className="min-h-0 gap-0 py-0">
            <CardHeader className="border-b py-2.5">
              <CardTitle className="flex items-baseline gap-2">
                Overdue deliveries <span className="text-xs font-normal text-muted-foreground">past due date</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
              {l.overdue.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No overdue deliveries. 🎉</p>
              ) : (
                <ul className="divide-y">
                  {l.overdue.map((po) => {
                    const late = po.at ? Math.floor((today.getTime() - po.at.getTime()) / 86_400_000) : 0;
                    return (
                      <li key={po.id}>
                        <Link href={`/purchase-orders/${po.id}`} className="flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-muted/50">
                          <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-600" />
                          <span className="shrink-0 font-medium">{poDisplayNumber({ id: po.id, poNumber: po.num })}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{po.party}</span>
                          <span className="shrink-0 text-xs font-medium text-destructive tabular">{late <= 0 ? "Due today" : `${late}d late`}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 gap-0 py-0">
            <CardHeader className="border-b py-2.5">
              <CardTitle className="flex items-baseline gap-2">
                Top vendors <span className="text-xs font-normal text-muted-foreground">by PO value, FY {financialYear()}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto py-2">
              {l.topVendors.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No POs issued this financial year yet.</p>
              ) : (
                <ol className="space-y-1.5" aria-label="Top vendors by PO value">
                  {l.topVendors.map((v) => {
                    const value = v.amount ?? 0;
                    return (
                      <li key={v.id}>
                        <div className="mb-0.5 flex items-baseline justify-between gap-3 text-sm">
                          <Link href={`/vendors/${v.id}`} className="truncate hover:text-primary hover:underline">
                            {v.party}
                          </Link>
                          <span className="shrink-0 font-medium tabular">{formatINRCompact(value)}</span>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="-my-0.5 py-0.5" tabIndex={0} aria-label={`${v.party}: ${formatINR(value)}`}>
                              <div className="h-1.5 rounded-full bg-muted">
                                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (value / topMax) * 100)}%` }} />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="font-medium">{v.party}</div>
                            <div className="tabular">
                              {formatINR(value)} · {v.n} PO{v.n === 1 ? "" : "s"}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  highlight,
  warn,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  href?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  const body = (
    <Card className={`h-full gap-1.5 py-3.5 transition-shadow ${href ? "hover:shadow-md hover:ring-primary/25" : ""} ${highlight ? "ring-amber-400/60" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span className={`grid size-8 place-items-center rounded-md ${highlight ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-primary/8 text-primary"}`}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold tracking-tight tabular">{value}</div>
        <p className={`mt-0.5 text-xs ${warn ? "font-medium text-destructive" : "text-muted-foreground"}`}>{sub}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

function Kpi({ icon: Icon, label, value, sub, tone, href }: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; href?: string }) {
  const body = (
    <div className={cn("h-full rounded-lg border px-3 py-2", href && "transition-colors hover:border-primary/40 hover:bg-muted/40", tone === "bad" && "border-rose-200 dark:border-rose-900")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "figure mt-0.5 text-lg font-semibold",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
          tone === "bad" && "text-rose-600",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
