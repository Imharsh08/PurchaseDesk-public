"use client";

import { useMemo, useState } from "react";
import { AlertTriangleIcon, CheckIcon, InfoIcon, Loader2Icon, SendIcon, StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatDate, formatINR, formatQty } from "@/lib/format";
import type { ComparisonLine, ComparisonVendor } from "@/lib/indents";
import { CERTIFICATION_LABELS, type Weights } from "@/lib/quote-scoring";
import { cn } from "@/lib/utils";
import { submitComparison } from "../actions";

const LOCATION_LABEL = { SAME_CITY: "Same city", SAME_STATE: "Same state", OTHER_STATE: "Other state", UNKNOWN: "Location unknown" };

export function ComparisonStatement({
  indentId,
  lines,
  vendors,
  weights,
  urgent,
  editable,
  minQuotes,
  justification,
  returnTo,
}: {
  returnTo?: string | null;
  indentId: number;
  lines: ComparisonLine[];
  vendors: ComparisonVendor[];
  weights: Weights;
  urgent: boolean;
  editable: boolean;
  minQuotes: number;
  justification: string | null;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [selected, setSelected] = useState<Record<number, number | undefined>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.indentItemId, l.selectedQuoteItemId ?? l.offers.find((o) => o.recommended)?.quoteItemId]),
    ),
  );
  const [reasons, setReasons] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.indentItemId, l.selectionReason ?? ""])),
  );
  const [why, setWhy] = useState(justification ?? "");
  const short = vendors.length < minQuotes;

  const offerFor = (line: ComparisonLine, quotationId: number) => line.offers.find((o) => o.quotationId === quotationId);
  const selectedOffer = (line: ComparisonLine) => line.offers.find((o) => o.quoteItemId === selected[line.indentItemId]);

  const selectedTotal = useMemo(
    () => lines.reduce((s, l) => s + (l.offers.find((o) => o.quoteItemId === selected[l.indentItemId])?.amount ?? 0), 0),
    [lines, selected],
  );
  const selectedVendors = new Set(lines.map((l) => selectedOffer(l)?.quotationId).filter(Boolean));

  function submit() {
    run(
      () =>
        submitComparison(indentId, {
          selections: lines.map((l) => ({
            indentItemId: l.indentItemId,
            quoteItemId: selected[l.indentItemId] ?? 0,
            reason: reasons[l.indentItemId],
          })),
          justification: why,
        }),
      {
        pending: "Sending for approval…",
        success: "Sent to a manager for approval",
        onSuccess: () => {
          if (returnTo) router.push(returnTo);
        },
      },
    );
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <Card className="gap-0 py-0" id="comparison">
      <CardHeader className="border-b py-4">
        <CardTitle>Comparative statement</CardTitle>
        <CardDescription>
          Net rates exclude GST. Score = price {pct(weights.price)}, delivery {pct(weights.delivery)}, quality{" "}
          {pct(weights.quality)}, payment terms {pct(weights.payment)}
          {urgent ? " (urgent indent: delivery weighted higher)" : ""}.{" "}
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2">
              How it&apos;s scored <InfoIcon className="size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-80 text-xs">
              Price: lowest rate ÷ vendor rate. Delivery: quoted days (50%), location (30%) and on-time history (20%).
              Quality: certification (40%) and defect history (60%). Payment: credit days (70%) and early-payment
              discount (30%). On-time and rejection history come from goods receipts of the last 12 months; vendors without
              receipts get neutral values (80% on time, defect score 85).
            </TooltipContent>
          </Tooltip>
        </CardDescription>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 360 + vendors.length * 190 }}>
          <thead>
            <tr className="border-b bg-muted/40 align-bottom text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 w-64 bg-muted py-3 pl-4 font-medium">Item</th>
              <th className="w-24 py-3 pr-3 text-right font-medium">Qty</th>
              {vendors.map((v) => (
                <th key={v.quotationId} className="min-w-44 border-l px-3 py-3 font-normal">
                  <div className="text-sm font-semibold text-foreground">{v.vendorName}</div>
                  <div className="mt-1 space-y-0.5">
                    <div>{v.deliveryDays !== null ? `${v.deliveryDays} days delivery` : "Delivery not stated"}</div>
                    <div>{v.creditDays ? `${v.creditDays} days credit` : "Advance / COD"}</div>
                    <div>
                      {CERTIFICATION_LABELS[v.certification]} · {LOCATION_LABEL[v.location]}
                    </div>
                    <div>
                      {v.receipts ? (
                        <>
                          <span className={cn(v.onTimePct !== null && v.onTimePct < 70 && "text-destructive")}>
                            {v.onTimePct === null ? "No due dates" : `${v.onTimePct}% on time`}
                          </span>
                          {" · "}
                          <span className={cn(v.rejectionPct !== null && v.rejectionPct > 5 && "text-destructive")}>
                            {v.rejectionPct === null ? "—" : `${v.rejectionPct}% rejected`}
                          </span>
                        </>
                      ) : (
                        "No delivery history yet"
                      )}
                    </div>
                    {v.openIssues > 0 && (
                      <div className="font-medium text-destructive">
                        {v.openIssues} open issue{v.openIssues === 1 ? "" : "s"}
                      </div>
                    )}
                    {v.validUntil && (
                      <div className={cn(new Date(v.validUntil) < new Date() && "font-medium text-destructive")}>
                        Valid till {formatDate(v.validUntil)}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const sel = selectedOffer(line);
              const needsReason = editable && sel && !sel.recommended;
              return [
                <tr key={line.indentItemId} className={cn("align-top", !needsReason && "border-b")}>
                  <td className="sticky left-0 z-10 bg-card py-3 pl-4">
                    <div className="font-medium">{line.description}</div>
                    <div className="text-xs text-muted-foreground">{line.sku}</div>
                    {line.lastPurchase && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last PO ₹{formatAmount(line.lastPurchase.rate)} · {line.lastPurchase.vendorName} · {formatDate(line.lastPurchase.date)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right tabular">
                    {formatQty(line.quantity)} <span className="text-muted-foreground">{line.uom}</span>
                  </td>
                  {vendors.map((v) => {
                    const offer = offerFor(line, v.quotationId);
                    if (!offer) {
                      return (
                        <td key={v.quotationId} className="border-l px-3 py-3 text-xs text-muted-foreground">
                          Not quoted
                        </td>
                      );
                    }
                    const isSelected = selected[line.indentItemId] === offer.quoteItemId;
                    const content = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold tabular">₹{formatAmount(offer.netRate)}</div>
                            <div className="text-xs text-muted-foreground tabular">
                              {offer.discountPct ? `${formatAmount(offer.rate)} less ${formatQty(offer.discountPct)}% · ` : ""}
                              {formatQty(offer.gstRate)}% GST
                            </div>
                          </div>
                          {(editable || isSelected) && (
                            <span
                              className={cn(
                                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                              )}
                            >
                              {isSelected && <CheckIcon className="size-3" />}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs tabular">Amount {formatAmount(offer.amount)}</div>
                        {line.lastPurchase && line.lastPurchase.rate > 0 && (
                          <VsLast rate={offer.netRate} last={line.lastPurchase.rate} />
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular">Score {offer.total}</span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs tabular">
                              Price {offer.price} · Delivery {offer.delivery} · Quality {offer.quality} · Payment {offer.payment}
                            </TooltipContent>
                          </Tooltip>
                          {offer.isL1 && <Badge className="h-4 border-transparent bg-emerald-100 px-1.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">L1</Badge>}
                          {offer.recommended && (
                            <Badge className="h-4 gap-0.5 border-transparent bg-primary/10 px-1.5 text-[10px] text-primary">
                              <StarIcon className="size-2.5 fill-current" />
                              Recommended
                            </Badge>
                          )}
                        </div>
                        {offer.remarks && <div className="mt-1 text-xs text-muted-foreground">{offer.remarks}</div>}
                      </>
                    );
                    return (
                      <td
                        key={v.quotationId}
                        className={cn("border-l px-3 py-3 transition-colors", isSelected && "bg-primary/5 ring-1 ring-primary/40 ring-inset")}
                      >
                        {editable ? (
                          <button
                            type="button"
                            className="w-full text-left"
                            aria-pressed={isSelected}
                            aria-label={`Choose ${v.vendorName} for ${line.description}`}
                            onClick={() => setSelected((s) => ({ ...s, [line.indentItemId]: offer.quoteItemId }))}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>,
                needsReason ? (
                  <tr key={`${line.indentItemId}-reason`} className="border-b">
                    <td colSpan={2 + vendors.length} className="bg-amber-50/60 px-4 pb-3 dark:bg-amber-950/20">
                      <Field orientation="horizontal" className="gap-3">
                        <FieldLabel htmlFor={`reason-${line.indentItemId}`} className="shrink-0 text-xs font-normal text-amber-800 dark:text-amber-300">
                          <AlertTriangleIcon className="size-3.5" />
                          Not the recommended vendor. Reason:
                        </FieldLabel>
                        <Input
                          id={`reason-${line.indentItemId}`}
                          value={reasons[line.indentItemId] ?? ""}
                          onChange={(e) => setReasons((r) => ({ ...r, [line.indentItemId]: e.target.value }))}
                          placeholder="e.g. Better quality history, existing vendor for this grade"
                          className="h-8 text-sm"
                        />
                      </Field>
                    </td>
                  </tr>
                ) : !editable && line.selectionReason ? (
                  <tr key={`${line.indentItemId}-reason`} className="border-b">
                    <td colSpan={2 + vendors.length} className="px-4 pb-3 text-xs text-amber-800 dark:text-amber-300">
                      Reason for choosing a non-recommended vendor: {line.selectionReason}
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
          <tfoot className="text-sm">
            <tr className="border-b">
              <td className="sticky left-0 bg-card py-2 pl-4 text-muted-foreground" colSpan={2}>
                Items total
              </td>
              {vendors.map((v) => (
                <td key={v.quotationId} className="border-l px-3 py-2 tabular">
                  {formatAmount(v.itemsTotal)}
                  {v.linesQuoted < lines.length && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({v.linesQuoted}/{lines.length} items)
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="sticky left-0 bg-card py-2 pl-4 text-muted-foreground" colSpan={2}>
                Freight / other charges
              </td>
              {vendors.map((v) => (
                <td key={v.quotationId} className="border-l px-3 py-2 tabular">
                  {v.freightTerms === "INCLUDED" ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Included</span>
                  ) : v.freightTerms === "EXTRA" ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      Extra{v.otherCharges ? ` ${formatAmount(v.otherCharges)}` : " (at actuals)"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground" title="Not stated on the quotation">
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b bg-muted/30 font-medium">
              <td className="sticky left-0 bg-muted py-2 pl-4" colSpan={2}>
                Total (excl. GST)
              </td>
              {vendors.map((v) => (
                <td key={v.quotationId} className="border-l px-3 py-2 tabular">
                  {formatAmount(v.total)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card py-2 pl-4 text-muted-foreground" colSpan={2}>
                Average score
              </td>
              {vendors.map((v) => (
                <td key={v.quotationId} className="border-l px-3 py-2 font-medium tabular">
                  {v.averageScore}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <CardContent className="space-y-4 border-t bg-muted/20 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Selected: {selectedVendors.size} vendor{selectedVendors.size === 1 ? "" : "s"} →{" "}
            {selectedVendors.size} purchase order{selectedVendors.size === 1 ? "" : "s"}
          </span>
          <span>
            Value of selection <span className="text-lg font-semibold tabular">{formatINR(selectedTotal)}</span>{" "}
            <span className="text-xs text-muted-foreground">excl. GST &amp; freight</span>
          </span>
        </div>

        {editable && short && (
          <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangleIcon />
            <AlertTitle>
              Only {vendors.length} of the minimum {minQuotes} quotations
            </AlertTitle>
            <AlertDescription className="w-full">
              <Field className="mt-2">
                <FieldLabel htmlFor="justification" className="sr-only">
                  Justification
                </FieldLabel>
                <Textarea
                  id="justification"
                  rows={2}
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Why fewer quotations? e.g. Proprietary part, single authorised dealer; urgent breakdown"
                  className="bg-background"
                />
                <FieldDescription>The approver sees this. Or add more quotations before submitting.</FieldDescription>
              </Field>
            </AlertDescription>
          </Alert>
        )}
        {!editable && justification && (
          <p className="text-sm">
            <span className="font-medium">Fewer than {minQuotes} quotations: </span>
            <span className="text-muted-foreground">{justification}</span>
          </p>
        )}

        {editable && (
          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Submit for approval
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VsLast({ rate, last }: { rate: number; last: number }) {
  const change = ((rate - last) / last) * 100;
  if (Math.abs(change) < 0.05) return <div className="text-xs text-muted-foreground">Same as last PO</div>;
  return (
    <div className={cn("text-xs tabular", change > 0 ? "text-rose-600" : "text-emerald-600")}>
      {change > 0 ? "+" : "−"}
      {Math.abs(change).toFixed(1)}% vs last PO
    </div>
  );
}