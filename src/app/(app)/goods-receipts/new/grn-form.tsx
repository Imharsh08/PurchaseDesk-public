"use client";

import { useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, FileSearchIcon, FileUpIcon, Loader2Icon, PackageCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { FormSection, TextAreaField, TextField, type FieldErrors } from "@/components/form-fields";
import { InvoiceReaderDialog, type ReaderResult } from "@/components/invoice-reader";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { formatQty, parseNumber } from "@/lib/format";
import { describePacks } from "@/lib/stock";
import { convertQty, sameUnit, type UnitItem } from "@/lib/units";
import { UnitSelect } from "@/components/unit-select";
import { cn } from "@/lib/utils";
import { createGoodsReceipt } from "../actions";

export type ReceiveLine = {
  poItemId: number;
  lineNo: number;
  sku: string;
  description: string;
  uom: string;
  packUnit: string | null;
  packSize: number | null;
  ordered: number;
  accepted: number;
  awaitingCheck: number;
  pending: number;
  /** PO rate, per uom (helps match invoice lines). */
  rate: number;
  /** The item's own unit, pack and conversions. */
  unitItem: UnitItem;
};

/** Quantities as typed, in `unit` (the unit the vendor billed in; the PO line's unit unless changed). */
type Qty = { invoiceQty: string; receivedQty: string; unit: string };

// Blank = null; pasted "1,250.5" counts as 1250.5.
const num = parseNumber;

export function GrnForm({
  poId,
  today,
  lines,
  dispatch,
  returnTo,
  vendorGstin,
  poNumber,
}: {
  returnTo?: string | null;
  poId: number;
  today: string;
  lines: ReceiveLine[];
  /** Bilty details recorded when the vendor dispatched */
  dispatch: { transporter: string; biltyNo: string; biltyDate: string };
  vendorGstin?: string | null;
  poNumber?: string | null;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [errors, setErrors] = useState<FieldErrors>();
  const [qty, setQty] = useState<Record<number, Qty>>(() =>
    Object.fromEntries(lines.map((l) => [l.poItemId, { invoiceQty: "", receivedQty: l.pending > 0 ? String(l.pending) : "", unit: l.uom }])),
  );
  const set = (id: number, patch: Partial<Qty>) => setQty((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  /** A typed quantity in the PO line's unit (what is saved and checked against pending). */
  const inLineUnit = (l: ReceiveLine, value: string) => {
    const n = num(value);
    if (n === null) return null;
    const q = qty[l.poItemId];
    const c = convertQty(l.unitItem, n, q.unit, l.uom);
    return c === null ? n : Math.round(c * 1000) / 1000;
  };
  const receiving = lines.filter((l) => (inLineUnit(l, qty[l.poItemId].receivedQty) ?? 0) > 0).length;
  const formRef = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<File | null>(null);

  /** Read the invoice chosen under "Invoice copy", or pick one (it is then attached as the invoice copy too). */
  function readInvoice() {
    const chosen = (formRef.current?.elements.namedItem("INVOICE") as HTMLInputElement | null)?.files?.[0];
    if (chosen) setReading(chosen);
    else picker.current?.click();
  }
  function picked(file: File | undefined) {
    if (!file) return;
    const input = formRef.current?.elements.namedItem("INVOICE") as HTMLInputElement | null;
    if (input) {
      const list = new DataTransfer();
      list.items.add(file);
      input.files = list.files;
    }
    setReading(file);
  }
  function fillFromInvoice({ fields, lines: read }: ReaderResult) {
    const form = formRef.current;
    if (!form) return;
    const put = (name: string, value: string | undefined) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el && value !== undefined) el.value = value;
    };
    put("invoiceNo", fields.invoiceNo);
    put("invoiceDate", fields.invoiceDate);
    put("invoiceAmount", fields.total);
    put("vehicleNo", fields.vehicleNo);
    put("challanNo", fields.challanNo);
    put("biltyNo", fields.lrNo);
    // The reader gives quantities in the PO line's unit.
    if (read.length) setQty((cur) => ({ ...cur, ...Object.fromEntries(read.map((l) => [l.key, { ...cur[l.key], invoiceQty: l.qty, unit: lines.find((x) => x.poItemId === l.key)?.uom ?? cur[l.key].unit }])) }));
    const n = Object.keys(fields).length + read.length;
    toast.success(`Filled ${n} value${n === 1 ? "" : "s"} from the invoice. Check them before saving.`);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    const data = {
      poId,
      receivedAt: text("receivedAt"),
      invoiceNo: text("invoiceNo"),
      invoiceDate: text("invoiceDate"),
      invoiceAmount: text("invoiceAmount"),
      challanNo: text("challanNo"),
      transporter: text("transporter"),
      biltyNo: text("biltyNo"),
      biltyDate: text("biltyDate"),
      vehicleNo: text("vehicleNo"),
      freightAmount: text("freightAmount"),
      remarks: text("remarks"),
      // Saved in the PO line's unit, whatever unit they were entered in.
      items: lines.map((l) => {
        const q = qty[l.poItemId];
        const asLine = (v: string) => (v.trim() === "" ? v : String(inLineUnit(l, v) ?? v));
        return { poItemId: l.poItemId, invoiceQty: asLine(q.invoiceQty), receivedQty: asLine(q.receivedQty) };
      }),
    };
    const payload = new FormData();
    payload.set("data", JSON.stringify(data));
    for (const key of ["INVOICE", "BILTY"]) {
      const file = form.get(key);
      if (file instanceof File && file.size > 0) payload.set(key, file);
    }
    run(() => createGoodsReceipt(payload), {
      pending: "Saving receipt…",
      success: (data) => `${data.grnNumber} saved. Next: quantity & quality check.`,
      onSuccess: (data) => {
        if (data.uploadError) toast.warning(data.uploadError);
        router.push(returnTo ?? `/goods-receipts/${data.id}`);
      },
      onError: (f) => setErrors(f.fieldErrors),
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-6">
      <input ref={picker} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => picked(e.target.files?.[0])} />
      <InvoiceReaderDialog
        file={reading}
        onClose={() => setReading(null)}
        fields={["invoiceNo", "invoiceDate", "total", "vehicleNo", "challanNo", "lrNo"]}
        lineRate={false}
        targets={lines.map((l) => ({
          key: l.poItemId,
          label: `${l.lineNo}. ${l.description}`,
          description: l.description,
          sku: l.sku,
          uom: l.uom,
          unitItem: l.unitItem,
          rate: l.rate,
          qty: l.pending,
        }))}
        vendorGstin={vendorGstin}
        orderNo={poNumber}
        onApply={fillFromInvoice}
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <h2 className="font-medium">Items received</h2>
          <span className="text-sm text-muted-foreground">Enter what physically arrived. Leave blank for items not in this delivery.</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" onClick={readInvoice} title="Fill invoice no., date, amount and invoice quantities from the vendor's invoice (PDF or photo)">
              <FileSearchIcon />
              Read invoice
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQty(Object.fromEntries(lines.map((l) => [l.poItemId, { ...qty[l.poItemId], receivedQty: l.pending > 0 ? String(l.pending) : "", unit: l.uom }])))}
            >
              Fill pending qty
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQty(Object.fromEntries(lines.map((l) => [l.poItemId, { invoiceQty: "", receivedQty: "", unit: l.uom }])))}
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="py-2.5 pl-4">Item</th>
                <th className="py-2.5 pr-3 text-right">Ordered</th>
                <th className="py-2.5 pr-3 text-right">Received so far</th>
                <th className="py-2.5 pr-3 text-right">Pending</th>
                <th className="w-40 py-2.5 pr-3">Invoice / challan qty</th>
                <th className="w-44 py-2.5 pr-4">Received now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const q = qty[l.poItemId];
                const received = inLineUnit(l, q.receivedQty);
                const invoice = inLineUnit(l, q.invoiceQty);
                const otherUnit = !sameUnit(q.unit, l.uom);
                const unitPicker = (label: string) => (
                  <UnitSelect item={l.unitItem} value={q.unit} also={[l.uom]} onChange={(unit) => set(l.poItemId, { unit })} label={`${l.description} ${label} unit`} className="h-7 border-0 bg-transparent px-0.5 text-xs" />
                );
                const over = received !== null && received > l.pending;
                const mismatch = received !== null && invoice !== null && received !== invoice;
                return (
                  <tr key={l.poItemId} className={cn("border-b align-top last:border-b-0", (received ?? 0) > 0 && "bg-primary/5")}>
                    <td className="py-3 pl-4">
                      <div className="font-medium">{l.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.sku}
                        {l.packUnit && l.packSize ? ` · 1 ${l.packUnit} = ${formatQty(l.packSize)} ${l.uom}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular">
                      {formatQty(l.ordered)} <span className="text-muted-foreground">{l.uom}</span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular">
                      {formatQty(l.accepted)}
                      {l.awaitingCheck > 0 && <div className="text-xs text-amber-700 dark:text-amber-400">+{formatQty(l.awaitingCheck)} awaiting check</div>}
                    </td>
                    <td className={cn("py-3 pr-3 text-right font-medium tabular", l.pending === 0 && "text-muted-foreground")}>
                      {formatQty(l.pending)}
                    </td>
                    <td className="py-2 pr-3">
                      <InputGroup>
                        <InputGroupInput
                          inputMode="decimal"
                          value={q.invoiceQty}
                          onChange={(e) => set(l.poItemId, { invoiceQty: e.target.value })}
                          className="text-right tabular"
                          placeholder="As billed"
                          aria-label={`${l.description} invoice quantity`}
                        />
                        <InputGroupAddon align="inline-end">{unitPicker("invoice")}</InputGroupAddon>
                      </InputGroup>
                      {otherUnit && invoice !== null && (
                        <div className="mt-1 text-right text-xs text-muted-foreground tabular">
                          = {formatQty(invoice)} {l.uom}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <InputGroup>
                        <InputGroupInput
                          inputMode="decimal"
                          value={q.receivedQty}
                          onChange={(e) => set(l.poItemId, { receivedQty: e.target.value })}
                          className="text-right tabular"
                          placeholder="0"
                          aria-label={`${l.description} received quantity`}
                        />
                        <InputGroupAddon align="inline-end">{unitPicker("received")}</InputGroupAddon>
                      </InputGroup>
                      {otherUnit && received !== null && received > 0 && (
                        <div className="mt-1 text-right text-xs font-medium tabular">
                          = {formatQty(received)} {l.uom}
                        </div>
                      )}
                      {!otherUnit && received !== null && received > 0 && l.packUnit && l.packSize && (
                        <div className="mt-1 text-right text-xs text-muted-foreground">{describePacks(received, l, formatQty)}</div>
                      )}
                      {over && (
                        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangleIcon className="size-3" />
                          {formatQty(received! - l.pending)} more than pending
                        </div>
                      )}
                      {mismatch && !over && (
                        <div className="mt-1 text-right text-xs text-amber-700 dark:text-amber-400">Differs from invoice by {formatQty(Math.abs(received! - invoice!))}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardContent className="grid gap-8 lg:grid-cols-2">
          <FormSection title="Receipt & invoice" description="From the vendor's tax invoice or delivery challan.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="receivedAt" label="Received on" type="date" defaultValue={today} max={today} required errors={errors} />
              <TextField name="challanNo" label="Delivery challan no." errors={errors} />
              <TextField name="invoiceNo" label="Invoice no." errors={errors} />
              <TextField name="invoiceDate" label="Invoice date" type="date" errors={errors} />
              <TextField name="invoiceAmount" label="Invoice amount (₹, incl. GST)" inputMode="decimal" errors={errors} />
              <FileField name="INVOICE" label="Invoice copy" />
            </div>
          </FormSection>
          <FormSection title="Transport / bilty" description="Lorry receipt (LR / GR / bilty) from the transporter.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="transporter" label="Transporter" defaultValue={dispatch.transporter} errors={errors} />
              <TextField name="vehicleNo" label="Vehicle no." placeholder="UP15 AB 1234" errors={errors} />
              <TextField name="biltyNo" label="Bilty / LR no." defaultValue={dispatch.biltyNo} errors={errors} />
              <TextField name="biltyDate" label="Bilty date" type="date" defaultValue={dispatch.biltyDate} errors={errors} />
              <TextField name="freightAmount" label="Freight paid (₹)" inputMode="decimal" errors={errors} />
              <FileField name="BILTY" label="Bilty copy" />
            </div>
          </FormSection>
          <TextAreaField
            name="remarks"
            label="Remarks"
            rows={2}
            placeholder="e.g. 2 bales torn, packing wet; unloaded at store 2"
            className="lg:col-span-2"
            errors={errors}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {receiving} item{receiving === 1 ? "" : "s"} in this delivery. Stock is updated after the quantity & quality check.
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" asChild>
              <Link href={`/purchase-orders/${poId}`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={pending || receiving === 0}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PackageCheckIcon />}
              Save receipt
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function FileField({ name, label }: { name: string; label: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>
        <FileUpIcon className="size-3.5" />
        {label}
      </FieldLabel>
      <Input id={name} name={name} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="text-xs" />
      <FieldDescription>PDF or photo, up to 5 MB</FieldDescription>
    </Field>
  );
}
