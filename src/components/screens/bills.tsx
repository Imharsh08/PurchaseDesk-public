import Link from "@/components/link";
import { AlertTriangleIcon, ClockIcon, IndianRupeeIcon, ReceiptIndianRupeeIcon, ShieldAlertIcon, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DateRangeNotice } from "@/components/date-range-notice";
import { PageHeader } from "@/components/page-header";
import { ShowMore } from "@/components/show-more";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { BILL_STATUS, PAYMENT_STATUS } from "@/lib/bill-labels";
import { ALL_DATES } from "@/lib/date-range";
import { BILL_VIEWS, daysLate } from "@/lib/screens/options";
import { formatDate, formatINR, formatINRCompact, toNumber } from "@/lib/format";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadBillsScreen } from "@/lib/screens/bills";

const VIEWS = BILL_VIEWS;

type Data = NonNullable<Awaited<ReturnType<typeof loadBillsScreen>>>;
export type BillsViewProps = Pick<Data, "counts" | "noBill" | "paid" | "paidCount" | "summary" | "toPass" | "unpaid" | "view"> & {
  limit: number;
  range: DateRange | null;
  sp: SearchParams;
  user: ScreenUser;
};

export function BillsView({ counts, limit, noBill, paid, paidCount, range, sp, summary, toPass, unpaid, user, view }: BillsViewProps) {
  const list = view === "due" ? unpaid : view === "pass" ? toPass : paid;
  return (
    <div className="space-y-6">
      <PageHeader title="Bills & payments" description="Vendor invoices matched against PO and goods receipt, passed for payment and paid — with MSME due dates." />
      <DateRangeNotice value={range?.value ?? ALL_DATES} what={view === "receipts" ? "receipts" : "bills (invoice date)"} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={IndianRupeeIcon} label="Outstanding payable" value={formatINRCompact(summary.totalOutstanding)} sub={`${unpaid.length} passed bill${unpaid.length === 1 ? "" : "s"}`} />
        <Kpi icon={AlertTriangleIcon} label="Overdue" value={formatINRCompact(summary.overdueAmount)} sub={`${summary.overdueCount} bill${summary.overdueCount === 1 ? "" : "s"} past due date`} warn={summary.overdueCount > 0} />
        <Kpi icon={ShieldAlertIcon} label="MSME due within 7 days / late" value={String(summary.msmeRiskCount)} sub="45-day rule, sec. 43B(h)" warn={summary.msmeRiskCount > 0} />
        <Kpi icon={ClockIcon} label="Waiting to be passed" value={String(toPass.length)} sub={`${noBill.length} checked receipt${noBill.length === 1 ? "" : "s"} without a bill`} warn={toPass.length > 0} />
      </div>

      {unpaid.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription className="font-medium">Ageing of outstanding</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {summary.buckets.map((b, i) => (
              <div key={b.label} className={cn("rounded-lg border p-3", i > 0 && b.amount > 0 && "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20")}>
                <div className="text-xs text-muted-foreground">{b.label}</div>
                <div className="mt-1 font-semibold tabular">{formatINRCompact(b.amount)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "due" ? "/bills" : `/bills?view=${v.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {v.label}
              {counts[v.key] ? <span className="ml-1.5 text-xs text-muted-foreground">{counts[v.key]}</span> : null}
            </Link>
          ))}
        </div>

        {view === "receipts" ? (
          noBill.length === 0 ? (
            <EmptyState icon={ReceiptIndianRupeeIcon} title="All checked receipts have a bill" />
          ) : (
            <ul className="divide-y">
              {noBill.slice(0, limit).map((g) => (
                <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <Link href={`/goods-receipts/${g.id}`} className="font-medium hover:text-primary hover:underline">
                      {g.grnNumber}
                    </Link>
                    {g.vendor.msme && <Badge variant="outline" className="ml-2">MSME</Badge>}
                    <div className="text-sm text-muted-foreground">
                      {g.vendor.name} · {g.po.poNumber} · accepted {g.qcAt ? formatDate(g.qcAt) : "—"}
                      {g.invoiceNo ? ` · invoice ${g.invoiceNo}` : ""}
                      {g.invoiceAmount ? ` · ${formatINR(g.invoiceAmount)}` : ""}
                    </div>
                  </div>
                  {can(user.roles, "enterBill") && (
                    <Button size="sm" asChild>
                      <Link href={`/bills/new?grn=${g.id}`}>
                        <ReceiptIndianRupeeIcon />
                        Enter bill
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
              {noBill.length > limit && (
                <li>
                  <ShowMore shown={limit} total={noBill.length} path="/bills" searchParams={sp} limit={limit} className="border-t-0" />
                </li>
              )}
            </ul>
          )
        ) : list.length === 0 ? (
          <EmptyState icon={ReceiptIndianRupeeIcon} title={view === "pass" ? "Nothing waiting to be passed" : view === "paid" ? "No paid bills yet" : "No unpaid bills"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 pl-4">Bill</th>
                  <th className="py-2.5 pr-3">Vendor</th>
                  <th className="py-2.5 pr-3 text-right">Invoice total</th>
                  <th className="py-2.5 pr-3 text-right">Debit</th>
                  <th className="py-2.5 pr-3 text-right">{view === "paid" ? "Paid" : "Outstanding"}</th>
                  <th className="py-2.5 pr-3">Due</th>
                  <th className="py-2.5 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const late = daysLate(b.dueDate);
                  const out = toNumber(b.payableAmount) - toNumber(b.paidAmount);
                  return (
                    <tr key={b.id} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="py-2.5 pl-4">
                        <Link href={`/bills/${b.id}`} className="font-medium hover:text-primary hover:underline">
                          {b.billNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          Inv {b.invoiceNo} · {formatDate(b.invoiceDate)} · {b.po.poNumber}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Link href={`/vendors/${b.vendor.id}`} className="hover:text-primary">
                          {b.vendor.name}
                        </Link>
                        {b.msme && <Badge variant="outline" className="ml-2">MSME</Badge>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatINR(b.totalAmount)}</td>
                      <td className={cn("py-2.5 pr-3 text-right tabular", toNumber(b.debitAmount) > 0 ? "text-rose-600" : "text-muted-foreground")}>
                        {toNumber(b.debitAmount) > 0 ? formatINR(b.debitAmount) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular">{formatINR(view === "paid" ? b.paidAmount : out)}</td>
                      <td className={cn("py-2.5 pr-3 whitespace-nowrap", view !== "paid" && late > 0 && "font-medium text-destructive")}>
                        {formatDate(b.dueDate)}
                        {view !== "paid" && b.status === "PASSED" && (
                          <div className="text-xs font-normal">{late > 0 ? `${late}d overdue` : late === 0 ? "Due today" : `in ${-late}d`}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge className={cn("border-transparent", BILL_STATUS[b.status].tone)}>{BILL_STATUS[b.status].label}</Badge>
                        {b.status === "PASSED" && b.paymentStatus !== "UNPAID" && (
                          <Badge className={cn("ml-1 border-transparent", PAYMENT_STATUS[b.paymentStatus].tone)}>{PAYMENT_STATUS[b.paymentStatus].label}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {view === "paid" && <ShowMore shown={paid.length} total={paidCount} path="/bills" searchParams={sp} limit={limit} />}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, warn }: { icon: LucideIcon; label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <Card className={cn("gap-2", warn && "ring-amber-400/60")}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription className="font-medium">{label}</CardDescription>
        <Icon className={cn("size-4", warn ? "text-amber-600" : "text-primary")} />
      </CardHeader>
      <CardContent>
        <div className="figure text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
