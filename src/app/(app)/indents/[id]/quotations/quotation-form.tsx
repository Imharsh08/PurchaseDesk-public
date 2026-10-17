"use client";

import { useMemo, useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { FileTextIcon, Loader2Icon, PaperclipIcon, SaveIcon } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatAmount, formatINR, formatQty, toNumber } from "@/lib/format";
import { GST_RATES } from "@/lib/gst";
import { netRate } from "@/lib/quote-scoring";
import { cn } from "@/lib/utils";
import { saveQuotation, uploadQuotationFile } from "../../actions";

export type QuoteVendorOption = { id: number; code: string; name: string; city: string | null; paymentTerms: string | null; leadTimeDays: number | null };
export type QuoteLine = { indentItemId: number; lineNo: number; description: string; sku: string; uom: string; quantity: number; defaultGst: number };

type LineState = { rate: string; discountPct: string; gstRate: string; remarks: string };

export type QuotationFormInitial = {
  vendorId: number | null;
  vendorRef: string;
  quoteDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  creditDays: string;
  earlyDiscountPct: string;
  /** "INCLUDED" | "EXTRA" | "" (not stated) */
  freightTerms: string;
  otherCharges: string;
  notes: string;
  lines: Record<number, LineState>;
  attachmentName: string | null;
};

// Pasted "66,750.00" counts as 66750 (commas, ₹ ignored).
const num = (v: string) => toNumber(v);

export function QuotationForm({
  indentId,
  quotationId,
  vendors,
  lines,
  initial,
}: {
  indentId: number;
  quotationId?: number;
  vendors: QuoteVendorOption[];
  lines: QuoteLine[];
  initial: QuotationFormInitial;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [uploading, runUpload] = useServerAction();
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [h, setH] = useState({ ...initial });
  const [values, setValues] = useState<Record<number, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.indentItemId, initial.lines[l.indentItemId] ?? { rate: "", discountPct: "", gstRate: String(l.defaultGst), remarks: "" }]),
    ),
  );
  const [attachment, setAttachment] = useState(initial.attachmentName);
  const fileRef = useRef<HTMLInputElement>(null);

  const vendorOptions = useMemo(
    () => vendors.map((v) => ({ value: String(v.id), label: v.name, hint: [v.code, v.city].filter(Boolean).join(" · "), keywords: [v.code] })),
    [vendors],
  );
  const err = (k: string) => errors?.[k]?.[0];
  const set = (id: number, patch: Partial<LineState>) => setValues((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  const itemsTotal = lines.reduce((s, l) => {
    const v = values[l.indentItemId];
    return v.rate === "" ? s : s + netRate(num(v.rate), num(v.discountPct)) * l.quantity;
  }, 0);
  const quoted = lines.filter((l) => values[l.indentItemId].rate !== "").length;

  function selectVendor(value: string) {
    const v = vendors.find((x) => x.id === Number(value));
    if (!v) return;
    setH((cur) => ({
      ...cur,
      vendorId: v.id,
      paymentTerms: cur.paymentTerms || v.paymentTerms || "",
      deliveryDays: cur.deliveryDays || (v.leadTimeDays !== null ? String(v.leadTimeDays) : ""),
    }));
  }

  function save() {
    run(
      () =>
        saveQuotation(indentId, quotationId ?? null, {
          vendorId: h.vendorId ?? 0,
          vendorRef: h.vendorRef,
          quoteDate: h.quoteDate,
          validUntil: h.validUntil,
          deliveryDays: h.deliveryDays,
          paymentTerms: h.paymentTerms,
          creditDays: h.creditDays || 0,
          earlyDiscountPct: h.earlyDiscountPct || 0,
          freightTerms: h.freightTerms === "INCLUDED" || h.freightTerms === "EXTRA" ? h.freightTerms : null,
          otherCharges: h.freightTerms === "INCLUDED" ? 0 : h.otherCharges || 0,
          notes: h.notes,
          items: lines.map((l) => ({
            indentItemId: l.indentItemId,
            rate: values[l.indentItemId].rate,
            discountPct: values[l.indentItemId].discountPct || 0,
            gstRate: values[l.indentItemId].gstRate,
            remarks: values[l.indentItemId].remarks,
          })),
        }),
      {
        pending: "Saving quotation…",
        success: quotationId ? "Quotation updated" : "Quotation added",
        onSuccess: (data) =>
          router.push(quotationId ? `/indents/${indentId}#quotations` : `/indents/${indentId}/quotations/${data.id}/edit?added=1`),
        onError: (f) => setErrors(f.fieldErrors),
      },
    );
  }

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !quotationId) return;
    const data = new FormData();
    data.set("file", file);
    runUpload(
      async () => {
        const result = await uploadQuotationFile(quotationId, data);
        if (fileRef.current) fileRef.current.value = "";
        return result;
      },
      { pending: `Uploading ${file.name}…`, success: "Quotation document attached", onSuccess: () => setAttachment(file.name) },
    );
  }

  return (
    <div>
      <div className="space-y-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendor & terms</CardTitle>
            <CardDescription>Copy these from the vendor&apos;s quotation. They feed the comparison score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <Field data-invalid={!!err("vendorId")}>
                <FieldLabel htmlFor="vendor">
                  Vendor<span className="text-destructive">*</span>
                </FieldLabel>
                <Combobox
                  id="vendor"
                  options={vendorOptions}
                  value={h.vendorId ? String(h.vendorId) : null}
                  onChange={selectVendor}
                  placeholder="Select vendor"
                  searchPlaceholder="Search vendors…"
                  emptyText="No other active vendors."
                  invalid={!!err("vendorId")}
                />
                {err("vendorId") && <FieldError>{err("vendorId")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="vendorRef">Quote no.</FieldLabel>
                <Input id="vendorRef" value={h.vendorRef} onChange={(e) => setH({ ...h, vendorRef: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="quoteDate">Quote date</FieldLabel>
                <Input id="quoteDate" type="date" value={h.quoteDate} onChange={(e) => setH({ ...h, quoteDate: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="validUntil">Valid until</FieldLabel>
                <Input id="validUntil" type="date" value={h.validUntil} onChange={(e) => setH({ ...h, validUntil: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-5">
              <Field data-invalid={!!err("deliveryDays")}>
                <FieldLabel htmlFor="deliveryDays">Delivery (days)</FieldLabel>
                <Input id="deliveryDays" inputMode="numeric" value={h.deliveryDays} onChange={(e) => setH({ ...h, deliveryDays: e.target.value })} />
                {err("deliveryDays") && <FieldError>{err("deliveryDays")}</FieldError>}
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
                <Input id="paymentTerms" value={h.paymentTerms} onChange={(e) => setH({ ...h, paymentTerms: e.target.value })} placeholder="e.g. 30 days from invoice" />
              </Field>
              <Field>
                <FieldLabel htmlFor="creditDays">Credit days</FieldLabel>
                <Input id="creditDays" inputMode="numeric" value={h.creditDays} onChange={(e) => setH({ ...h, creditDays: e.target.value })} placeholder="0 = advance" />
              </Field>
              <Field>
                <FieldLabel htmlFor="earlyDiscountPct">Early-pay disc. %</FieldLabel>
                <Input id="earlyDiscountPct" inputMode="decimal" value={h.earlyDiscountPct} onChange={(e) => setH({ ...h, earlyDiscountPct: e.target.value })} placeholder="0" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>Rates</CardTitle>
            <CardDescription>Rates exclusive of GST. Leave the rate blank for items this vendor did not quote.</CardDescription>
          </CardHeader>
          {err("items") && <p className="px-4 pt-3 text-sm text-destructive">{err("items")}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-10 py-2.5 pl-4">#</th>
                  <th className="py-2.5 pr-2">Item</th>
                  <th className="w-28 py-2.5 pr-2 text-right">Qty</th>
                  <th className="w-32 py-2.5 pr-2 text-right">Rate (₹)</th>
                  <th className="w-20 py-2.5 pr-2 text-right">Disc %</th>
                  <th className="w-24 py-2.5 pr-2">GST</th>
                  <th className="w-32 py-2.5 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const v = values[l.indentItemId];
                  const amount = v.rate === "" ? null : netRate(num(v.rate), num(v.discountPct)) * l.quantity;
                  return (
                    <tr key={l.indentItemId} className="border-b align-top last:border-b-0">
                      <td className="py-3 pl-4 text-muted-foreground tabular">{l.lineNo}</td>
                      <td className="py-2 pr-2">
                        <div className="pt-1.5 font-medium">{l.description}</div>
                        <div className="text-xs text-muted-foreground">{l.sku}</div>
                        <Input
                          value={v.remarks}
                          onChange={(e) => set(l.indentItemId, { remarks: e.target.value })}
                          placeholder="Make / brand / note"
                          className="mt-1.5 h-7 text-xs"
                        />
                      </td>
                      <td className="py-3 pr-2 text-right tabular">
                        {formatQty(l.quantity)} <span className="text-muted-foreground">{l.uom}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          inputMode="decimal"
                          value={v.rate}
                          onChange={(e) => set(l.indentItemId, { rate: e.target.value })}
                          className="text-right tabular"
                          placeholder="Not quoted"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          inputMode="decimal"
                          value={v.discountPct}
                          onChange={(e) => set(l.indentItemId, { discountPct: e.target.value })}
                          className="text-right tabular"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={v.gstRate} onValueChange={(g) => set(l.indentItemId, { gstRate: g })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GST_RATES.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 pr-4 text-right tabular">
                        {amount === null ? <span className="text-muted-foreground">—</span> : formatAmount(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t bg-muted/20 p-4 sm:grid-cols-[1fr_auto]">
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} placeholder="Anything else in the quote: warranty, test certificate, packing…" />
            </Field>
            <div className="w-full space-y-2 text-sm sm:w-72">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items ({quoted} of {lines.length})</span>
                <span className="tabular">{formatAmount(itemsTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Freight</span>
                <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Freight">
                  {(
                    [
                      ["INCLUDED", "Included"],
                      ["EXTRA", "Extra"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={h.freightTerms === value}
                      onClick={() => setH({ ...h, freightTerms: h.freightTerms === value ? "" : value, otherCharges: value === "INCLUDED" ? "" : h.otherCharges })}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        h.freightTerms === value ? (value === "INCLUDED" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white") : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {h.freightTerms !== "INCLUDED" && (
                <Field orientation="horizontal" className="justify-between">
                  <FieldLabel htmlFor="otherCharges" className="font-normal text-muted-foreground">
                    {h.freightTerms === "EXTRA" ? "Freight / other charges (blank = at actuals)" : "Freight / other charges"}
                  </FieldLabel>
                  <Input
                    id="otherCharges"
                    inputMode="decimal"
                    value={h.otherCharges}
                    onChange={(e) => setH({ ...h, otherCharges: e.target.value, freightTerms: e.target.value.trim() && num(e.target.value) > 0 ? "EXTRA" : h.freightTerms })}
                    className="h-8 w-28 text-right tabular"
                    placeholder="0"
                  />
                </Field>
              )}
              <div className="flex items-baseline justify-between border-t pt-2">
                <span className="font-medium">Total (excl. GST)</span>
                <span className="text-lg font-semibold tabular">{formatINR(itemsTotal + (h.freightTerms === "INCLUDED" ? 0 : num(h.otherCharges)))}</span>
              </div>
              {h.freightTerms === "EXTRA" && !num(h.otherCharges) && <p className="text-xs text-amber-700 dark:text-amber-400">Freight extra at actuals: not in the total.</p>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vendor&apos;s quotation document</CardTitle>
            <CardDescription>Attach the PDF or photo the vendor sent, for the record. PDF, PNG or JPG up to 5 MB.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {attachment ? (
              <a
                href={`/api/quotations/${quotationId}/file`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <FileTextIcon className="size-4 text-rose-600" />
                {attachment}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">No document attached.</span>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={upload} />
            <Button variant="outline" size="sm" disabled={!quotationId || uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
              {attachment ? "Replace" : "Attach file"}
            </Button>
            {!quotationId && <FieldDescription className="w-full">Save the quotation first, then attach its document.</FieldDescription>}
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={`/indents/${indentId}#quotations`}>{quotationId ? "Done" : "Cancel"}</Link>
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {quotationId ? "Save quotation" : "Add quotation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
