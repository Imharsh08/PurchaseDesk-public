import Link from "@/components/link";
import { ActivityLog } from "@/components/activity-log";
import { BackLink } from "@/components/back-link";
import { StepsCard } from "@/components/steps-card";
import { BanIcon, CheckCircle2Icon, ClockIcon, ReceiptIndianRupeeIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminDeleteButton } from "@/components/admin-delete";
import { LiveStatusBadge, LiveStatusProvider } from "@/components/live-status";
import { PageHeader } from "@/components/page-header";
import { IssueList, RaiseIssueButton } from "@/components/vendor-issues";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatDate, formatDateTime, formatQty, toNumber } from "@/lib/format";
import { CHECK_LABEL, GRN_STATUS } from "@/lib/grn-labels";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { CancelGrnButton, GrnDocuments, GrnStepButtons } from "@/app/(app)/goods-receipts/[id]/grn-client";
import { QcForm } from "@/app/(app)/goods-receipts/[id]/qc-form";
import type { ScreenUser } from "@/components/screens/types";
import type { loadGoodsReceiptScreen } from "@/lib/screens/goods-receipt";

type Data = NonNullable<Awaited<ReturnType<typeof loadGoodsReceiptScreen>>>;
export type GoodsReceiptViewProps = Pick<Data, "activity" | "canQc" | "canReceive" | "daysLate" | "done" | "grn" | "issues" | "itemOptions" | "rejected" | "timeline"> & {
  openStep: "return" | "store" | null;
  returnTo: string | null;
  user: ScreenUser;
};

export function GoodsReceiptView({ activity, canQc, canReceive, daysLate, done, grn, issues, itemOptions, openStep, rejected, returnTo, timeline, user }: GoodsReceiptViewProps) {
  const due = grn.po.expectedDeliveryDate;
  return (
    <LiveStatusProvider status={grn.status}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={
            <BackLink href="/goods-receipts">Goods receipts</BackLink>
          }
          title={
            <span className="flex flex-wrap items-center gap-3">
              {grn.grnNumber}
              <LiveStatusBadge labels={GRN_STATUS} className="text-xs" />
            </span>
          }
          description={
            <>
              <Link href={`/vendors/${grn.vendor.id}`} className="hover:text-primary hover:underline">
                {grn.vendor.name}
              </Link>{" "}
              · against{" "}
              <Link href={`/purchase-orders/${grn.po.id}`} className="text-primary hover:underline">
                {grn.po.poNumber}
              </Link>{" "}
              · received {formatDate(grn.receivedAt)}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {can(user.roles, "raiseIssue") && grn.status !== "CANCELLED" && (
                <RaiseIssueButton vendorId={grn.vendorId} poId={grn.poId} grnId={grn.id} items={itemOptions} />
              )}
              {grn.status === "PENDING_QC" && canReceive && <CancelGrnButton grnId={grn.id} grnNumber={grn.grnNumber} />}
              {done && canReceive && <GrnStepButtons grnId={grn.id} canReturn={rejected && !grn.returnedAt} canStore={!grn.storedAt} open={openStep} returnTo={returnTo} />}
              {done &&
                (grn.bill ? (
                  <Button variant="outline" asChild>
                    <Link href={`/bills/${grn.bill.id}`}>
                      <ReceiptIndianRupeeIcon />
                      {grn.bill.billNumber}
                    </Link>
                  </Button>
                ) : (
                  can(user.roles, "enterBill") && (
                    <Button asChild>
                      <Link href={`/bills/new?grn=${grn.id}`}>
                        <ReceiptIndianRupeeIcon />
                        Enter bill
                      </Link>
                    </Button>
                  )
                ))}
              <AdminDeleteButton
                entity="goods_receipt"
                id={grn.id}
                name={grn.grnNumber}
                consequences={
                  grn.status === "COMPLETED"
                    ? "The accepted quantity is taken back out of stock and off the PO's received quantity. Attached invoice/bilty files are deleted. Not possible once a bill is entered; delete the bill first."
                    : "Its lines and attached invoice/bilty files are deleted too. Nothing was added to stock yet."
                }
              />
            </div>
          }
        />

        {grn.status === "CANCELLED" && (
          <Alert variant="destructive">
            <BanIcon />
            <AlertTitle>Cancelled on {formatDateTime(grn.cancelledAt)}</AlertTitle>
            <AlertDescription>{grn.cancelReason}</AlertDescription>
          </Alert>
        )}
        {grn.status === "PENDING_QC" && !canQc && (
          <Alert>
            <ClockIcon />
            <AlertDescription>Waiting for the quantity & quality check. Stock is updated once the material is checked.</AlertDescription>
          </Alert>
        )}

        <div className={cn("grid items-start gap-6", timeline && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
          <div className="min-w-0 space-y-6">
            <Card>
              <CardContent className="grid gap-6 text-sm md:grid-cols-3">
                <Block title="Receipt">
                  <Meta label="Received" value={formatDate(grn.receivedAt)} />
                  <Meta label="By" value={grn.receivedBy.name} />
                  <Meta
                    label="Delivery"
                    value={
                      daysLate === null
                        ? "No due date on PO"
                        : daysLate > 0
                          ? `${daysLate} day${daysLate === 1 ? "" : "s"} late (due ${formatDate(due)})`
                          : `On time (due ${formatDate(due)})`
                    }
                    tone={daysLate !== null && daysLate > 0 ? "text-destructive" : daysLate !== null ? "text-emerald-700 dark:text-emerald-400" : undefined}
                  />
                  {grn.qcAt && <Meta label="Checked" value={`${formatDateTime(grn.qcAt)} · ${grn.qcBy?.name ?? ""}`} />}
                  {grn.returnedAt && <Meta label="Returned" value={`${formatDateTime(grn.returnedAt)} · ${grn.returnNote ?? ""}`} />}
                  {grn.storedAt && <Meta label="Stored" value={`${formatDateTime(grn.storedAt)} · ${grn.storedBy?.name ?? ""}${grn.tallyRef ? ` · Tally ${grn.tallyRef}` : ""}`} />}
                </Block>
                <Block title="Invoice">
                  <Meta label="Invoice no." value={grn.invoiceNo} />
                  <Meta label="Date" value={grn.invoiceDate ? formatDate(grn.invoiceDate) : null} />
                  <Meta label="Amount" value={grn.invoiceAmount ? `₹${formatAmount(grn.invoiceAmount)}` : null} />
                  <Meta label="Challan" value={grn.challanNo} />
                </Block>
                <Block title="Transport / bilty">
                  <Meta label="Transporter" value={grn.transporter} />
                  <Meta label="Bilty / LR" value={[grn.biltyNo, grn.biltyDate ? formatDate(grn.biltyDate) : null].filter(Boolean).join(" · ") || null} />
                  <Meta label="Vehicle" value={grn.vehicleNo} />
                  <Meta label="Freight" value={grn.freightAmount ? `₹${formatAmount(grn.freightAmount)}` : null} />
                </Block>
                {(grn.remarks || grn.qcRemarks) && (
                  <div className="space-y-1 md:col-span-3">
                    {grn.remarks && <p className="text-muted-foreground"><span className="font-medium text-foreground">Receipt remarks:</span> {grn.remarks}</p>}
                    {grn.qcRemarks && <p className="text-muted-foreground"><span className="font-medium text-foreground">Check remarks:</span> {grn.qcRemarks}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {canQc ? (
              <QcForm
                returnTo={returnTo}
                grnId={grn.id}
                lines={grn.items.map((l) => ({
                  id: l.id,
                  description: l.poItem.description,
                  sku: l.item.sku,
                  uom: l.poItem.uom,
                  invoiceQty: l.invoiceQty === null ? null : toNumber(l.invoiceQty),
                  receivedQty: toNumber(l.receivedQty),
                }))}
              />
            ) : (
              <Card className="gap-0 py-0">
                <CardHeader className="border-b py-4">
                  <CardTitle>Items</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                        <th className="py-2.5 pl-4">Item</th>
                        <th className="py-2.5 pr-3 text-right">Invoice qty</th>
                        <th className="py-2.5 pr-3 text-right">Received</th>
                        <th className="py-2.5 pr-3">Qty check</th>
                        <th className="py-2.5 pr-3">Quality</th>
                        <th className="py-2.5 pr-3 text-right">Accepted</th>
                        <th className="py-2.5 pr-4 text-right">Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grn.items.map((l) => (
                        <tr key={l.id} className="border-b align-top last:border-b-0">
                          <td className="py-3 pl-4">
                            <div className="font-medium">{l.poItem.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {l.item.sku}
                              {l.remarks ? ` · ${l.remarks}` : ""}
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right tabular">{l.invoiceQty === null ? "—" : formatQty(l.invoiceQty)}</td>
                          <td className="py-3 pr-3 text-right tabular">
                            {formatQty(l.receivedQty)} <span className="text-muted-foreground">{l.poItem.uom}</span>
                          </td>
                          <td className="py-3 pr-3"><Check value={l.qtyCheck} /></td>
                          <td className="py-3 pr-3"><Check value={l.qualityCheck} /></td>
                          <td className="py-3 pr-3 text-right font-medium tabular">{l.acceptedQty === null ? "—" : formatQty(l.acceptedQty)}</td>
                          <td className={cn("py-3 pr-4 text-right tabular", toNumber(l.rejectedQty) > 0 && "font-medium text-rose-600")}>
                            {l.rejectedQty === null ? "—" : formatQty(l.rejectedQty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor issues</CardTitle>
                  <CardDescription>Raised automatically when a check fails, or by hand. Resolve once settled with the vendor.</CardDescription>
                </CardHeader>
                <CardContent>
                  <IssueList issues={issues} canResolve={can(user.roles, "resolveIssue")} empty="No issues with this delivery." />
                </CardContent>
              </Card>
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Documents</CardTitle>
                    <CardDescription>Invoice, bilty / LR, test certificate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <GrnDocuments
                      grnId={grn.id}
                      canUpload={canReceive && grn.status !== "CANCELLED"}
                      documents={grn.documents.map((d) => ({
                        id: d.id,
                        type: d.type,
                        fileName: d.fileName,
                        size: d.size,
                        createdAt: formatDateTime(d.createdAt),
                        by: d.createdBy?.name ?? null,
                      }))}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
            <ActivityLog entries={activity} open={!timeline} />
          </div>
          {timeline && (
            <aside className="space-y-6 xl:sticky xl:top-20">
              <StepsCard timeline={timeline} highlight={`${timeline.indentId}-${grn.po.id}-${grn.id}`} />
            </aside>
          )}
        </div>
      </div>
    </LiveStatusProvider>
  );
}

function Check({ value }: { value: "PASS" | "FAIL" | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return value === "PASS" ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2Icon className="size-3.5" />
      {CHECK_LABEL.PASS}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-medium text-rose-600">
      <XCircleIcon className="size-3.5" />
      {CHECK_LABEL.FAIL}
    </span>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <dl className="space-y-0.5">{children}</dl>
    </div>
  );
}

function Meta({ label, value, tone }: { label: string; value: string | null | undefined; tone?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", !value && "text-muted-foreground", tone)}>{value || "—"}</dd>
    </div>
  );
}
