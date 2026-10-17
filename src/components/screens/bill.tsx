import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { StepsCard } from "@/components/steps-card";
import { AlertTriangleIcon, CheckCircle2Icon, PauseIcon } from "lucide-react";
import { AdminDeleteButton } from "@/components/admin-delete";
import { LiveStatusBadge, LiveStatusProvider } from "@/components/live-status";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BILL_STATUS, PAYMENT_STATUS } from "@/lib/bill-labels";
import { formatAmount, formatDate, formatDateTime, formatINR, formatQty, toDateInput, toNumber } from "@/lib/format";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { InvoiceFiles } from "@/app/(app)/bills/invoice-files";
import { BillActions } from "@/app/(app)/bills/[id]/bill-actions";
import type { ScreenUser } from "@/components/screens/types";
import type { loadBillScreen } from "@/lib/screens/bill";

type Data = NonNullable<Awaited<ReturnType<typeof loadBillScreen>>>;
export type BillViewProps = Pick<Data, "bill" | "debit" | "invoiceFiles" | "outstanding" | "overdueDays" | "timeline"> & {
  user: ScreenUser;
};

export function BillView({ bill, debit, invoiceFiles, outstanding, overdueDays, timeline, user }: BillViewProps) {
  const today = new Date();
  return (
    <LiveStatusProvider status={bill.status}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={
            <BackLink href="/bills">Bills & payments</BackLink>
          }
          title={
            <span className="flex flex-wrap items-center gap-3">
              {bill.billNumber}
              <LiveStatusBadge labels={BILL_STATUS} className="text-xs" />
              {bill.status === "PASSED" && (
                <Badge className={cn("border-transparent text-xs", PAYMENT_STATUS[bill.paymentStatus].tone)}>{PAYMENT_STATUS[bill.paymentStatus].label}</Badge>
              )}
              {bill.msme && <Badge variant="outline" className="text-xs">MSME</Badge>}
            </span>
          }
          description={
            <>
              <Link href={`/vendors/${bill.vendor.id}`} className="hover:text-primary hover:underline">
                {bill.vendor.name}
              </Link>{" "}
              · Invoice {bill.invoiceNo} dated {formatDate(bill.invoiceDate)} ·{" "}
              <Link href={`/purchase-orders/${bill.po.id}`} className="text-primary hover:underline">
                {bill.po.poNumber}
              </Link>{" "}
              ·{" "}
              <Link href={`/goods-receipts/${bill.grn.id}`} className="text-primary hover:underline">
                {bill.grn.grnNumber}
              </Link>
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <BillActions
              bill={{ id: bill.id, grnId: bill.grnId, status: bill.status, billNumber: bill.billNumber, outstanding, hasDebitNote: debit > 0, today: toDateInput(today) }}
              can={{ edit: can(user.roles, "enterBill"), pass: can(user.roles, "passBill"), pay: can(user.roles, "recordPayment") }}
              />
              <AdminDeleteButton
                entity="bill"
                id={bill.id}
                name={bill.billNumber}
                consequences="Its lines, debit note and recorded payments are deleted too. The goods receipt becomes free to enter the bill again."
              />
            </div>
          }
        />

        {bill.status === "HOLD" && (
          <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <PauseIcon />
            <AlertTitle>On hold</AlertTitle>
            <AlertDescription>{bill.holdReason}</AlertDescription>
          </Alert>
        )}
        {bill.status === "PASSED" && bill.paymentStatus !== "PAID" && overdueDays > 0 && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>
              Payment overdue by {overdueDays} day{overdueDays === 1 ? "" : "s"}
            </AlertTitle>
            <AlertDescription>
              {bill.msme ? "MSME vendor: interest at 3× the RBI bank rate is payable on delayed payments (MSMED Act sec. 16), and the expense is disallowed under income tax sec. 43B(h) until paid." : `Was due on ${formatDate(bill.dueDate)}.`}
            </AlertDescription>
          </Alert>
        )}

        <div className={cn("grid items-start gap-6", timeline && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
          <div className="min-w-0 space-y-6">
            <div className={cn("grid gap-4 sm:grid-cols-2", !timeline && "xl:grid-cols-4")}>
              <Stat label="Invoice total" value={formatINR(bill.totalAmount)} sub={`Taxable ${formatAmount(bill.taxableAmount)} + GST ${formatAmount(bill.taxAmount)}${toNumber(bill.otherCharges) ? ` + charges ${formatAmount(bill.otherCharges)}` : ""}`} />
              <Stat label="Should be" value={formatINR(bill.expectedAmount)} sub="Accepted qty × PO rate + GST" />
              <Stat label="Debit" value={debit ? formatINR(debit) : "—"} sub={bill.debitNoteNumber ? `Debit note ${bill.debitNoteNumber}` : debit ? "Note number issued when passed" : "Bill matches"} tone={debit ? "bad" : "good"} />
              <Stat
                label={bill.paymentStatus === "PAID" ? "Paid" : "Outstanding"}
                value={formatINR(bill.paymentStatus === "PAID" ? bill.paidAmount : outstanding)}
                sub={`Payable ${formatINR(bill.payableAmount)} · due ${formatDate(bill.dueDate)} (${bill.msme ? `MSME ${bill.creditDays > 0 ? Math.min(bill.creditDays, 45) : 15}d from acceptance` : `${bill.creditDays}d credit`})`}
                tone={overdueDays > 0 && bill.paymentStatus !== "PAID" ? "bad" : undefined}
              />
            </div>

            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center gap-2">
                  {debit ? <AlertTriangleIcon className="size-4 text-rose-600" /> : <CheckCircle2Icon className="size-4 text-emerald-600" />}
                  Three-way match
                </CardTitle>
                <CardDescription>Invoice vs purchase order rate vs accepted quantity</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                      <th className="py-2.5 pl-4">Item</th>
                      <th className="py-2.5 pr-3 text-right">Accepted</th>
                      <th className="py-2.5 pr-3 text-right">Billed qty</th>
                      <th className="py-2.5 pr-3 text-right">PO rate</th>
                      <th className="py-2.5 pr-3 text-right">Billed rate</th>
                      <th className="py-2.5 pr-3 text-right">GST</th>
                      <th className="py-2.5 pr-4 text-right">Debit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines.map((l) => {
                      const qtyOver = toNumber(l.billedQty) > toNumber(l.acceptedQty);
                      const rateOver = toNumber(l.billedRate) > toNumber(l.poRate);
                      return (
                        <tr key={l.id} className={cn("border-b last:border-b-0", toNumber(l.debitAmount) > 0 && "bg-rose-50/60 dark:bg-rose-950/20")}>
                          <td className="py-2.5 pl-4 font-medium">{l.description}</td>
                          <td className="py-2.5 pr-3 text-right tabular">
                            {formatQty(l.acceptedQty)} <span className="text-muted-foreground">{l.uom}</span>
                          </td>
                          <td className={cn("py-2.5 pr-3 text-right tabular", qtyOver && "font-medium text-rose-600")}>{formatQty(l.billedQty)}</td>
                          <td className="py-2.5 pr-3 text-right tabular">₹{formatAmount(l.poRate)}</td>
                          <td className={cn("py-2.5 pr-3 text-right tabular", rateOver && "font-medium text-rose-600")}>₹{formatAmount(l.billedRate)}</td>
                          <td className="py-2.5 pr-3 text-right tabular">{formatQty(l.gstRate)}%</td>
                          <td className={cn("py-2.5 pr-4 text-right tabular", toNumber(l.debitAmount) > 0 ? "font-medium text-rose-600" : "text-muted-foreground")}>
                            {toNumber(l.debitAmount) > 0 ? formatAmount(l.debitAmount) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {toNumber(bill.otherDebit) > 0 && (
                      <tr className="border-t">
                        <td className="py-2.5 pl-4" colSpan={6}>
                          Other deduction: {bill.otherDebitReason}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium text-rose-600 tabular">{formatAmount(bill.otherDebit)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  {bill.payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{bill.status === "PASSED" ? "No payment recorded yet." : "Payments can be recorded once the bill is passed."}</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {bill.payments.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">
                              {p.mode}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(p.paidOn)} · {p.createdBy.name}
                              {p.note ? ` · ${p.note}` : ""}
                            </div>
                          </div>
                          <div className="font-medium tabular">{formatINR(p.amount)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Record</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    Entered by {bill.createdBy.name} · {formatDateTime(bill.createdAt)}
                  </p>
                  {bill.passedBy && (
                    <p>
                      Passed by {bill.passedBy.name} · {formatDateTime(bill.passedAt)}
                    </p>
                  )}
                  <p>
                    Material received {formatDate(bill.grn.receivedAt)}, accepted {bill.grn.qcAt ? formatDate(bill.grn.qcAt) : "—"}
                  </p>
                  {bill.remarks && <p className="text-foreground">{bill.remarks}</p>}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Invoice copy</CardTitle>
                  <CardDescription>The vendor&apos;s invoice, kept with goods receipt {bill.grn.grnNumber}</CardDescription>
                </CardHeader>
                <CardContent>
                  <InvoiceFiles grnId={bill.grnId} files={invoiceFiles} canEdit={can(user.roles, "enterBill") && bill.status !== "CANCELLED"} />
                </CardContent>
              </Card>
            </div>
          </div>
          {timeline && (
            <aside className="space-y-6 xl:sticky xl:top-20">
              <StepsCard timeline={timeline} highlight={`${timeline.indentId}-${bill.po.id}-${bill.grn.id}`} />
            </aside>
          )}
        </div>
      </div>
    </LiveStatusProvider>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <Card className="gap-1.5">
      <CardHeader>
        <CardDescription className="font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("text-xl font-semibold tabular", tone === "bad" && "text-rose-600", tone === "good" && "text-emerald-700 dark:text-emerald-400")}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
