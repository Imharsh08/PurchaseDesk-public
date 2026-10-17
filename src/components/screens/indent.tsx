import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { AlertCircleIcon, BanIcon, CheckIcon, FileTextIcon, InfoIcon, PaperclipIcon, ScaleIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { UrgentBadge } from "@/components/indent-status-badge";
import { AdminDeleteButton } from "@/components/admin-delete";
import { LiveStatusBadge, LiveStatusProvider } from "@/components/live-status";
import { INDENT_STATUS } from "@/lib/indent-status";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatDateTime, formatINR, formatQty, toNumber } from "@/lib/format";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { poDisplayNumber } from "@/lib/po-status";
import { connectGmailHref } from "@/lib/mail-links";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { ActivityLog } from "@/components/activity-log";
import { IndentTimeline } from "@/components/indent-timeline";
import { FMS_STEPS, formatHours } from "@/lib/fms-steps";
import { ComparisonStatement } from "@/app/(app)/indents/[id]/comparison-statement";
import { IndentActions } from "@/app/(app)/indents/[id]/indent-actions";
import { RfqDialog } from "@/app/(app)/indents/[id]/rfq-dialog";
import { QuotationRowActions } from "@/app/(app)/indents/[id]/quotation-row-actions";
import type { ScreenUser } from "@/components/screens/types";
import type { loadIndentScreen } from "@/lib/screens/indent";

const QUOTATION_DELETE_NOTE =
  "Its rates are removed from the comparison. If this vendor was selected on a comparison awaiting or given approval, the indent goes back to collecting quotes. Not possible once a PO was created from it.";

type Data = NonNullable<Awaited<ReturnType<typeof loadIndentScreen>>>;
export type IndentViewProps = Pick<Data, "activity" | "approveBlocked" | "canQuote" | "company" | "comparison" | "indent" | "isOwnerOrLead" | "limitNote" | "quoteCount" | "rfqMessage" | "rfqVendors" | "selectedVendorCount" | "showRfq" | "timeline" | "value"> & {
  id: number;
  returnTo: string | null;
  user: ScreenUser;
};

export function IndentView({ activity, approveBlocked, canQuote, company, comparison, id, indent, isOwnerOrLead, limitNote, quoteCount, returnTo, rfqMessage, rfqVendors, selectedVendorCount, showRfq, timeline, user, value }: IndentViewProps) {
  // The step the indent is at now (the first PO / lot row with something to do).
  const nowRow = timeline.rows.find((r) => r.current);
  const now = nowRow?.current ? { code: nowRow.current, cell: nowRow.cells[nowRow.current], short: FMS_STEPS.find((s) => s.code === nowRow.current)!.short } : null;
  const timelineView = <IndentTimeline rows={timeline.rows} assigned={timeline.assigned} canDo={timeline.canDo} draft={indent.status === "DRAFT"} />;
  const details = (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <Meta label="Department" value={indent.department} />
          <Meta label="Required by" value={indent.requiredBy ? formatDate(indent.requiredBy) : null} />
          <Meta label="Priority" value={indent.priority === "URGENT" ? "Urgent" : "Normal"} />
          <Meta label="Raised" value={formatDateTime(indent.createdAt)} />
          {indent.comparisonSubmittedBy && <Meta label="Compared by" value={indent.comparisonSubmittedBy.name} />}
        </dl>
        {indent.purpose && <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-line text-muted-foreground">{indent.purpose}</p>}
      </CardContent>
    </Card>
  );
  return (
    <LiveStatusProvider status={indent.status}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={
            <BackLink href="/indents">Indents</BackLink>
          }
          title={
            <span className="flex flex-wrap items-center gap-3">
              {indent.indentNumber}
              <LiveStatusBadge labels={INDENT_STATUS} className="text-xs" />
              {indent.priority === "URGENT" && <UrgentBadge />}
            </span>
          }
          description={`${indent.items.length} item${indent.items.length === 1 ? "" : "s"} · raised by ${indent.requestedBy.name}${indent.department ? `, ${indent.department}` : ""}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {showRfq && (
                <RfqDialog
                  indentId={id}
                  gmailConnected={user.gmailConnected}
                  connectHref={connectGmailHref(`/indents/${id}`)}
                  subject={`Request for quotation – ${indent.indentNumber}${company ? ` – ${company.name}` : ""}`}
                  message={rfqMessage}
                  vendors={rfqVendors
                    .map((v) => ({ id: v.id, name: v.name, email: v.email, city: v.city, suggested: v.items.length > 0 }))
                    .sort((a, b) => Number(b.suggested) - Number(a.suggested))}
                />
              )}
            <IndentActions
              returnTo={returnTo}
              indent={{ id, status: indent.status, indentNumber: indent.indentNumber, vendorCount: selectedVendorCount }}
              can={{
                edit: can(user.roles, "raiseIndent") && isOwnerOrLead,
                addQuote: canQuote,
                approve: can(user.roles, "approveComparison") && !approveBlocked && !limitNote,
                createPOs: can(user.roles, "createPO"),
                cancel: can(user.roles, "raiseIndent") && isOwnerOrLead,
              }}
            />
              <AdminDeleteButton
                entity="indent"
                id={id}
                name={indent.indentNumber}
                consequences="Its lines and all quotations collected on it are deleted too. Not possible once purchase orders exist; delete those first."
              />
            </div>
          }
        />

        {indent.status === "OPEN" && indent.rejectionReason && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Sent back by the approver</AlertTitle>
            <AlertDescription>{indent.rejectionReason}</AlertDescription>
          </Alert>
        )}
        {indent.status === "CANCELLED" && (
          <Alert variant="destructive">
            <BanIcon />
            <AlertTitle>Cancelled on {formatDateTime(indent.cancelledAt)}</AlertTitle>
            <AlertDescription>{indent.cancelReason}</AlertDescription>
          </Alert>
        )}
        {indent.status === "PENDING_APPROVAL" && value !== null && (
          <Alert className={limitNote ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : undefined}>
            <InfoIcon />
            <AlertTitle>Selection value {formatINR(value)} incl. GST</AlertTitle>
            {limitNote && <AlertDescription>{limitNote}</AlertDescription>}
          </Alert>
        )}
        {indent.status === "PENDING_APPROVAL" && approveBlocked && (
          <Alert>
            <InfoIcon />
            <AlertDescription>You submitted this comparison, so another manager or an admin needs to approve it.</AlertDescription>
          </Alert>
        )}
        {indent.status === "APPROVED" && indent.approvalNote && (
          <Alert>
            <CheckIcon />
            <AlertTitle>Approval note</AlertTitle>
            <AlertDescription>{indent.approvalNote}</AlertDescription>
          </Alert>
        )}

        {/* Phones and narrow windows: where it is now, folded; the full timeline opens below it. */}
        {indent.status !== "CANCELLED" && (
          <details className="group rounded-xl border bg-card xl:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
              <span className="font-medium">Where it is now:</span>
              {now ? (
                <span className={cn(now.cell.state === "overdue" ? "font-medium text-rose-700 dark:text-rose-400" : "text-primary")}>
                  {now.code} {now.short}
                  {now.cell.state === "overdue" && now.cell.delayHours !== null ? ` · overdue ${formatHours(now.cell.delayHours)}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">{indent.status === "DRAFT" ? "Draft" : "All steps done"}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Show steps</span>
            </summary>
            <div className="border-t px-4 py-4">{timelineView}</div>
          </details>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* Wide screens: the timeline on the right, always in view. */}
          <aside className="hidden space-y-6 xl:sticky xl:top-20 xl:order-last xl:block">
            {indent.status !== "CANCELLED" && (
              <Card className="gap-0 py-0">
                <CardHeader className="border-b py-4">
                  <CardTitle>Where it is now</CardTitle>
                  <CardDescription>FMS steps, with who does each</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[calc(100vh-14rem)] overflow-y-auto py-4">{timelineView}</CardContent>
              </Card>
            )}
            {details}
          </aside>
          <div className="min-w-0 space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Items required</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="pr-4">
                    {["APPROVED", "ORDERED", "PENDING_APPROVAL"].includes(indent.status) ? "Selected vendor" : "Remarks"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indent.items.map((line) => {
                  const sel = comparison?.lines.find((l) => l.indentItemId === line.id)?.offers.find((o) => o.quoteItemId === line.selectedQuoteItemId);
                  return (
                    <TableRow key={line.id} className="align-top">
                      <TableCell className="pl-4 text-muted-foreground tabular">{line.lineNo}</TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{line.description}</div>
                        <div className="text-xs text-muted-foreground">{line.item.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatQty(line.quantity)} <span className="text-muted-foreground">{line.uom}</span>
                      </TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
                        {line.currentStock !== null ? formatQty(line.currentStock) : "—"}
                      </TableCell>
                      <TableCell className="pr-4 text-sm whitespace-normal">
                        {sel ? (
                          <>
                            <div>{sel.vendorName}</div>
                            <div className="text-xs text-muted-foreground tabular">
                              ₹{formatAmount(sel.netRate)} / {line.uom}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{line.remarks ?? "—"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="xl:hidden">{details}</div>

        {indent.status !== "DRAFT" && (
          <Card className="gap-0 py-0" id="quotations">
            <CardHeader className="border-b py-4">
              <CardTitle>Quotations</CardTitle>
              <CardDescription>
                {quoteCount} received
                {quoteCount < MIN_QUOTATIONS && indent.status === "OPEN" && (
                  <span className="text-amber-700 dark:text-amber-400"> · at least {MIN_QUOTATIONS} required, or a written justification</span>
                )}
              </CardDescription>
              {indent.status === "OPEN" && canQuote && (
                <CardAction>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/indents/${id}/quotations/new`}>Add quotation</Link>
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            {quoteCount === 0 ? (
              <EmptyState
                icon={ScaleIcon}
                title="No quotations yet"
                description={canQuote ? "Ask vendors for quotes and enter each one here." : "Purchase is collecting quotations."}
                className="py-10"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Vendor</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total (excl. GST)</TableHead>
                    <TableHead className="w-24 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indent.quotations.map((q) => {
                    const v = comparison?.vendors.find((x) => x.quotationId === q.id);
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="pl-4">
                          <div className="font-medium">{q.vendor.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {v?.linesQuoted ?? 0}/{indent.items.length} items quoted · added by {q.createdBy.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{q.vendorRef ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {q.quoteDate ? formatDate(q.quoteDate) : ""}
                            {q.validUntil ? ` · valid till ${formatDate(q.validUntil)}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular">{q.deliveryDays !== null ? `${q.deliveryDays} days` : "—"}</TableCell>
                        <TableCell className="text-sm">
                          <div>{q.paymentTerms ?? (q.creditDays ? `${q.creditDays} days` : "Advance")}</div>
                          {toNumber(q.otherCharges) > 0 ? (
                            <div className="text-xs text-muted-foreground">+ ₹{formatAmount(q.otherCharges)} freight/other</div>
                          ) : q.freightTerms === "INCLUDED" ? (
                            <div className="text-xs text-emerald-700 dark:text-emerald-400">Freight included</div>
                          ) : q.freightTerms === "EXTRA" ? (
                            <div className="text-xs text-amber-700 dark:text-amber-400">Freight extra, at actuals</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">{v ? formatINR(v.total) : "—"}</TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-1">
                            {q.attachmentPath && (
                              <Button variant="ghost" size="icon-sm" asChild aria-label="Open vendor's quotation document">
                                <a href={`/api/quotations/${q.id}/file`} target="_blank" rel="noopener">
                                  <PaperclipIcon />
                                </a>
                              </Button>
                            )}
                            {indent.status === "OPEN" && canQuote ? (
                              <QuotationRowActions indentId={id} quotationId={q.id} vendorName={q.vendor.name} />
                            ) : (
                              <AdminDeleteButton entity="quotation" id={q.id} name={`${q.vendor.name}'s quotation`} icon stay consequences={QUOTATION_DELETE_NOTE} />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        )}

        {comparison && (
          <ComparisonStatement
            returnTo={returnTo}
            indentId={id}
            lines={comparison.lines}
            vendors={comparison.vendors}
            weights={comparison.weights}
            urgent={comparison.urgent}
            editable={indent.status === "OPEN" && canQuote}
            minQuotes={MIN_QUOTATIONS}
            justification={indent.quoteJustification}
          />
        )}

        {indent.purchaseOrders.length > 0 && (
          <Card className="gap-0 py-0" id="purchase-orders">
            <CardHeader className="border-b py-4">
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>Created from the approved selection. Vendor, items and rates are locked.</CardDescription>
            </CardHeader>
            <ul className="divide-y">
              {indent.purchaseOrders.map((po) => (
                <li key={po.id}>
                  <Link href={`/purchase-orders/${po.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{poDisplayNumber(po)}</div>
                      <div className="truncate text-sm text-muted-foreground">{po.vendor.name}</div>
                    </div>
                    <POStatusBadge status={po.status} />
                    <div className="w-28 text-right font-medium tabular">{formatINR(po.grandTotal)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ActivityLog entries={activity} />
          </div>
        </div>
      </div>
    </LiveStatusProvider>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0", !value && "text-muted-foreground")}>{value || "—"}</dd>
    </div>
  );
}
