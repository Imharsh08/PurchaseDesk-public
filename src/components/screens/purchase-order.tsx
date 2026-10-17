import Link from "@/components/link";
import { ActivityLog } from "@/components/activity-log";
import { BackLink } from "@/components/back-link";
import { StepsCard } from "@/components/steps-card";
import { AlertCircleIcon, BanIcon, CheckIcon, EyeIcon, FileTextIcon, InfoIcon, PackageCheckIcon, ShieldCheckIcon } from "lucide-react";
import { AddressBlock } from "@/components/address-picker";
import { AdminDeleteButton } from "@/components/admin-delete";
import { LiveStatusBadge, LiveStatusProvider } from "@/components/live-status";
import { PO_STATUS } from "@/lib/po-status";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueList, RaiseIssueButton } from "@/components/vendor-issues";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { amountInWords, formatAmount, formatDate, formatDateTime, formatINR, formatQty, toDateInput, toNumber } from "@/lib/format";
import { DOCUMENT_LABEL, GRN_STATUS } from "@/lib/grn-labels";
import { connectGmailHref } from "@/lib/mail-links";
import { fmsReturnTo } from "@/lib/fms-steps";
import { AMENDABLE } from "@/lib/po-status";
import { can } from "@/lib/roles";
import { stateName } from "@/lib/states";
import { cn } from "@/lib/utils";
import { AmendmentCard } from "@/app/(app)/purchase-orders/[id]/amendment-card";
import { POActions } from "@/app/(app)/purchase-orders/[id]/po-actions";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { loadPurchaseOrderScreen } from "@/lib/screens/purchase-order";

type Data = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrderScreen>>>;
export type PurchaseOrderViewProps = Pick<Data, "activity" | "amendmentLimitNote" | "amendments" | "canDecideAmendment" | "company" | "currentStep" | "displayNumber" | "documents" | "fallbackAddress" | "intra" | "isCreatorOrLead" | "issues" | "limitNote" | "linked" | "ownApprovalBlocked" | "pdf" | "pendingAmendment" | "po" | "receipts" | "showDiscount" | "showReceived" | "steps" | "timeline"> & {
  sp: SearchParams;
  /** Optional: an API not yet redeployed doesn't send it. */
  transport?: Data["transport"];
  user: ScreenUser;
};

export function PurchaseOrderView({ activity, amendmentLimitNote, amendments, canDecideAmendment, company, currentStep, displayNumber, documents, fallbackAddress, intra, isCreatorOrLead, issues, limitNote, linked, ownApprovalBlocked, pdf, pendingAmendment, po, receipts, showDiscount, showReceived, sp, steps, timeline, transport, user }: PurchaseOrderViewProps) {
  return (
    <LiveStatusProvider status={po.status}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={
            <BackLink href="/purchase-orders">Purchase orders</BackLink>
          }
          title={
            <span className="flex flex-wrap items-center gap-3">
              {displayNumber}
              <LiveStatusBadge labels={PO_STATUS} className="text-xs" />
            </span>
          }
          description={
            <>
              {po.vendor.name} · <span className="font-medium text-foreground tabular">{formatINR(po.grandTotal)}</span>
              {po.poDate && <> · Issued {formatDate(po.poDate)}</>}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
            <POActions
              po={{
                id: po.id,
                status: po.status,
                poNumber: po.poNumber,
                displayNumber: po.revision ? `${displayNumber} Rev. ${po.revision}` : displayNumber,
                grandTotal: formatINR(po.grandTotal),
                poDate: formatDate(po.poDate),
                linked,
                shortClosed: !!po.shortClosedAt,
              }}
              vendor={{ name: po.vendor.name, contactPerson: po.vendor.contactPerson, email: po.vendor.email }}
              companyName={company.name}
              userName={user.name}
              can={{
                edit: can(user.roles, "createPO") && isCreatorOrLead,
                submit: can(user.roles, "createPO") && isCreatorOrLead,
                approve: can(user.roles, "approvePO") && !ownApprovalBlocked && !limitNote,
                send: can(user.roles, "sendPO"),
                cancel: can(user.roles, "cancelPO"),
                regenerate: can(user.roles, "approvePO"),
                receive: can(user.roles, "receiveGoods"),
                amend: can(user.roles, "amendPO") && AMENDABLE.includes(po.status) && !pendingAmendment,
                shortClose: can(user.roles, "cancelPO") || can(user.roles, "receiveGoods"),
              }}
              balance={po.items
                .filter((l) => toNumber(l.quantity) > toNumber(l.quantityReceived))
                .map((l) => ({
                  description: l.description,
                  ordered: `${formatQty(l.quantity)} ${l.uom}`,
                  received: `${formatQty(l.quantityReceived)} ${l.uom}`,
                  short: `${formatQty(toNumber(l.quantity) - toNumber(l.quantityReceived))} ${l.uom}`,
                }))}
              pendingQc={receipts.find((g) => g.status === "PENDING_QC")?.grnNumber ?? null}
              hasPdf={!!pdf}
              dispatched={!!po.dispatchedAt}
              transport={transport}
              confirmed={!!po.acknowledgedAt}
              startWith={typeof sp.do === "string" ? sp.do : null}
              returnTo={fmsReturnTo(sp.from)}
              today={toDateInput(new Date())}
              emailConfigured={user.gmailConnected}
              connectGmailHref={connectGmailHref(`/purchase-orders/${po.id}`)}
            />
              <AdminDeleteButton
                entity="purchase_order"
                id={po.id}
                name={displayNumber}
                consequences={
                  <>
                    Its lines, PDFs and amendments are deleted too.
                    {po.indent && ` If it is ${po.indent.indentNumber}'s only PO, the indent goes back to “approved” so the PO can be created again.`} Not possible once material is received
                    or billed; delete those first.
                  </>
                }
              />
            </div>
          }
        />

        {po.status === "DRAFT" && po.rejectionReason && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Sent back by approver</AlertTitle>
            <AlertDescription>{po.rejectionReason}</AlertDescription>
          </Alert>
        )}
        {po.status === "CANCELLED" && (
          <Alert variant="destructive">
            <BanIcon />
            <AlertTitle>Cancelled on {formatDateTime(po.cancelledAt)}</AlertTitle>
            <AlertDescription>{po.cancelReason}</AlertDescription>
          </Alert>
        )}
        {po.shortClosedAt && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Short closed on {formatDateTime(po.shortClosedAt)}</AlertTitle>
            <AlertDescription>{po.shortCloseReason}</AlertDescription>
          </Alert>
        )}
        {limitNote && (
          <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <InfoIcon />
            <AlertTitle>Above your approval limit</AlertTitle>
            <AlertDescription>{limitNote}</AlertDescription>
          </Alert>
        )}
        {po.status === "PENDING_APPROVAL" && ownApprovalBlocked && (
          <Alert>
            <InfoIcon />
            <AlertDescription>You created this PO, so another manager or an admin needs to approve it.</AlertDescription>
          </Alert>
        )}
        {po.status === "PENDING_APPROVAL" && !can(user.roles, "approvePO") && (
          <Alert>
            <InfoIcon />
            <AlertDescription>Waiting for a manager to approve. You&apos;ll be able to send it once it&apos;s approved.</AlertDescription>
          </Alert>
        )}

        {/* Progress (POs without an indent; the others show their FMS steps on the right) */}
        {po.status !== "CANCELLED" && !timeline && (
          <Card className="py-0">
            <ol className="grid grid-cols-2 md:grid-cols-4">
              {steps.map((step, i) => (
                <li
                  key={step.label}
                  className={cn(
                    "relative flex items-start gap-3 border-b px-4 py-4 md:border-r md:border-b-0 md:last:border-r-0",
                    i % 2 === 0 && "border-r",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1",
                      step.done
                        ? "bg-primary text-primary-foreground ring-primary"
                        : i === currentStep
                          ? "bg-primary/10 text-primary ring-primary/40"
                          : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {step.done ? <CheckIcon className="size-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className={cn("text-sm font-medium", !step.done && i !== currentStep && "text-muted-foreground")}>
                      {step.label}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {step.done && step.at
                        ? `${formatDateTime(step.at)}${step.by ? ` · ${step.by}` : ""}`
                        : i === currentStep
                          ? "Up next"
                          : "Pending"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardContent className="grid gap-6 text-sm md:grid-cols-3">
                <InfoBlock title="Vendor">
                  <div className="font-medium">
                    <Link href={`/vendors/${po.vendor.id}`} className="hover:text-primary hover:underline">
                      {po.vendor.name}
                    </Link>
                  </div>
                  <div className="text-muted-foreground">
                    {[po.vendor.city, stateName(po.vendor.stateCode)].filter(Boolean).join(", ")}
                  </div>
                  <dl className="mt-2 space-y-0.5">
                    <Meta label="GSTIN" value={po.vendor.gstin} mono />
                    <Meta label="Contact" value={po.vendor.contactPerson} />
                    <Meta label="Email" value={po.vendor.email} />
                    <Meta label="Phone" value={po.vendor.phone} />
                  </dl>
                </InfoBlock>
                <InfoBlock title="Order">
                  <dl className="space-y-0.5">
                    <Meta label="PO date" value={po.poDate ? formatDate(po.poDate) : "On approval"} />
                    <Meta label="Delivery by" value={po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : null} />
                    {po.expectedDispatchDate && <Meta label="Dispatch by" value={`${formatDate(po.expectedDispatchDate)} (vendor confirmed)`} />}
                    {po.followUpAt && <Meta label="Follow-up" value={`${formatDate(po.followUpAt)}: ${po.followUpNote ?? ""}`} />}
                    {po.dispatchedAt && (
                      <Meta label="Dispatched" value={`${formatDate(po.dispatchedAt)} · LR ${po.dispatchBiltyNo ?? ""}${po.dispatchTransporter ? ` · ${po.dispatchTransporter}` : ""}`} />
                    )}
                    {po.indent && (
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">Indent</dt>
                        <dd>
                          <Link href={`/indents/${po.indent.id}#comparison`} className="text-primary hover:underline">
                            {po.indent.indentNumber}
                          </Link>
                        </dd>
                      </div>
                    )}
                    <Meta label="Quote ref." value={po.quotationRef} />
                    <Meta label="Quote date" value={po.quotationDate ? formatDate(po.quotationDate) : null} />
                    <Meta label="Payment" value={po.paymentTerms} />
                    <Meta label="Tax" value={intra ? "CGST + SGST (intra-state)" : "IGST (inter-state)"} />
                  </dl>
                </InfoBlock>
                <div className="space-y-4">
                  <InfoBlock title="Bill to">
                    <AddressBlock text={po.billingAddress?.trim() || fallbackAddress.billing} />
                  </InfoBlock>
                  <InfoBlock title="Ship to">
                    <AddressBlock text={po.deliveryAddress?.trim() || fallbackAddress.shipping} />
                    {po.sentTo && (
                      <dl className="mt-2">
                        <Meta label="Sent to" value={po.sentTo} />
                      </dl>
                    )}
                  </InfoBlock>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Line items</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 pl-4">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {showReceived && <TableHead className="text-right">Received</TableHead>}
                    <TableHead className="text-right">Rate</TableHead>
                    {showDiscount && <TableHead className="text-right">Disc.</TableHead>}
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((line) => (
                    <TableRow key={line.id} className="align-top">
                      <TableCell className="pl-4 text-muted-foreground tabular">{line.lineNo}</TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{line.description}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{line.item.sku}</span>
                          {line.hsnCode && ` · HSN ${line.hsnCode}`}
                          {line.remarks && ` · ${line.remarks}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatQty(line.quantity)} <span className="text-muted-foreground">{line.uom}</span>
                      </TableCell>
                      {showReceived && (
                        <TableCell
                          className={cn(
                            "text-right tabular",
                            toNumber(line.quantityReceived) >= toNumber(line.quantity) ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {formatQty(line.quantityReceived)}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular">{formatAmount(line.rate)}</TableCell>
                      {showDiscount && (
                        <TableCell className="text-right tabular">
                          {toNumber(line.discountPct) ? `${formatQty(line.discountPct)}%` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular">{formatAmount(line.taxableAmount)}</TableCell>
                      <TableCell className="text-right tabular">
                        <div>{formatQty(line.gstRate)}%</div>
                        <div className="text-xs text-muted-foreground">{formatAmount(line.taxAmount)}</div>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular">{formatAmount(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-transparent">
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7 + (showDiscount ? 1 : 0) + (showReceived ? 1 : 0)} className="p-0">
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
                        <p className="max-w-sm text-xs font-normal whitespace-normal text-muted-foreground">
                          {amountInWords(po.grandTotal)}
                        </p>
                        <dl className="w-full max-w-72 space-y-1.5 text-sm font-normal">
                          <TotalRow label="Taxable value" value={po.subtotal} />
                          {intra ? (
                            <>
                              <TotalRow label="CGST" value={po.cgstAmount} />
                              <TotalRow label="SGST" value={po.sgstAmount} />
                            </>
                          ) : (
                            <TotalRow label="IGST" value={po.igstAmount} />
                          )}
                          {toNumber(po.roundOff) !== 0 && <TotalRow label="Round off" value={po.roundOff} />}
                          <div className="flex items-baseline justify-between border-t pt-2">
                            <dt className="font-medium">Grand total</dt>
                            <dd className="figure text-lg font-semibold">{formatINR(po.grandTotal)}</dd>
                          </div>
                        </dl>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>

            {(po.terms || po.internalNotes) && (
              <div className="grid gap-6 md:grid-cols-2">
                {po.terms && (
                  <Card className={cn(!po.internalNotes && "md:col-span-2")}>
                    <CardHeader>
                      <CardTitle>Terms & conditions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-line text-muted-foreground">{po.terms}</p>
                    </CardContent>
                  </Card>
                )}
                {po.internalNotes && (
                  <Card className={cn(!po.terms && "md:col-span-2")}>
                    <CardHeader>
                      <CardTitle>Internal notes</CardTitle>
                      <CardDescription>Not printed on the PO</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
                        <LinkedText text={po.internalNotes} />
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-6">
            {timeline && po.status !== "CANCELLED" && <StepsCard timeline={timeline} />}
            {amendments.length > 0 && (
              <AmendmentCard
                canDecide={canDecideAmendment}
                limitNote={amendmentLimitNote}
                canWithdraw={!!pendingAmendment && can(user.roles, "amendPO") && (pendingAmendment.requestedById === user.id || isCreatorOrLead)}
                amendments={amendments.map((a) => ({
                  id: a.id,
                  revisionNo: a.revisionNo,
                  status: a.status,
                  reason: a.reason,
                  summary: a.summary as string[],
                  oldTotal: formatINR(a.oldTotal),
                  newTotal: formatINR(a.newTotal),
                  increase: toNumber(a.newTotal) > toNumber(a.oldTotal),
                  requestedBy: a.requestedBy.name,
                  requestedAt: formatDateTime(a.requestedAt),
                  decidedBy: a.decidedBy?.name ?? null,
                  decidedAt: a.decidedAt ? formatDateTime(a.decidedAt) : null,
                  decisionNote: a.decisionNote,
                }))}
              />
            )}
            {(receipts.length > 0 || po.poNumber) && po.status !== "CANCELLED" && (
              <Card>
                <CardHeader>
                  <CardTitle>Goods receipts</CardTitle>
                  <CardDescription>Deliveries received against this PO</CardDescription>
                </CardHeader>
                <CardContent>
                  {receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing received yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {receipts.map((g) => (
                        <li key={g.id}>
                          <Link href={`/goods-receipts/${g.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 hover:border-primary/40 hover:bg-accent/50">
                            <PackageCheckIcon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1 text-sm">
                              <div className="font-medium">{g.grnNumber}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {formatDate(g.receivedAt)}
                                {g.invoiceNo ? ` · Inv ${g.invoiceNo}` : ""}
                                {g._count.issues ? ` · ${g._count.issues} issue${g._count.issues === 1 ? "" : "s"}` : ""}
                              </div>
                            </div>
                            <Badge className={cn("border-transparent", GRN_STATUS[g.status].tone)}>{GRN_STATUS[g.status].label}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {(issues.length > 0 || (po.poNumber && can(user.roles, "raiseIssue"))) && po.status !== "CANCELLED" && (
              <Card>
                <CardHeader>
                  <CardTitle>Vendor issues</CardTitle>
                  {po.poNumber && can(user.roles, "raiseIssue") && (
                    <CardAction>
                      <RaiseIssueButton vendorId={po.vendorId} poId={po.id} size="sm" items={po.items.map((l) => ({ id: l.itemId, name: l.description }))} />
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <IssueList issues={issues} canResolve={can(user.roles, "resolveIssue")} empty="No issues with this order." />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Purchase order PDF</CardTitle>
                <CardDescription>
                  {po.poNumber
                    ? "The issued PDF is stored and is exactly what the vendor receives."
                    : "Preview shows a DRAFT watermark until the PO is approved."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pdf ? (
                  <a
                    href={`/api/purchase-orders/${po.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950 dark:ring-rose-900">
                      <FileTextIcon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:text-primary">{pdf.fileName}</div>
                      <div className="text-xs text-muted-foreground">
                        v{pdf.version} · {(pdf.size / 1024).toFixed(0)} KB · {formatDateTime(pdf.createdAt)}
                      </div>
                    </div>
                  </a>
                ) : po.poNumber ? (
                  <p className="text-sm text-muted-foreground">
                    The PDF hasn&apos;t been generated yet. It will be created the first time it&apos;s opened.
                  </p>
                ) : (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={`/api/purchase-orders/${po.id}/pdf`} target="_blank" rel="noopener">
                      <EyeIcon />
                      Preview draft PDF
                    </a>
                  </Button>
                )}
                {pdf && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheckIcon className="size-3.5" />
                    SHA-256 {pdf.sha256.slice(0, 12)}…
                  </p>
                )}
              </CardContent>
            </Card>

            {documents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>PO copies, invoices and bilties on file</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {documents.map((d) => (
                      <li key={d.id}>
                        <a
                          href={`/api/documents/${d.id}`}
                          target="_blank"
                          rel="noopener"
                          className="group flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/50"
                        >
                          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium group-hover:text-primary">{d.fileName}</div>
                            <div className="text-xs text-muted-foreground">
                              {DOCUMENT_LABEL[d.type] ?? d.type}
                              {d.grn && ` · ${d.grn.grnNumber}`} · {(d.size / 1024).toFixed(0)} KB
                            </div>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <ActivityLog entries={activity} open={!timeline} />
          </aside>
        </div>
      </div>
    </LiveStatusProvider>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s,]+)/g;

/** Plain text with web links made clickable (e.g. PO copies and invoices from the old FMS sheet). */
function LinkedText({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    let label = "Open link";
    try {
      const host = new URL(part).hostname;
      label = host.includes("drive.google") ? "Google Drive file" : host.includes("appsheet") ? "AppSheet file" : host;
    } catch {
      // Not a valid URL: show it as text.
      return part;
    }
    return (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
        {label} ↗
      </a>
    );
  });
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-xs leading-5", !value && "text-muted-foreground")}>
        {value || "—"}
      </dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: Parameters<typeof formatAmount>[0] }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{formatAmount(value)}</dd>
    </div>
  );
}
