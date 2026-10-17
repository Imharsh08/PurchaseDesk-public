"use client";

import { useMemo, useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, FileSearchIcon, Loader2Icon, ReceiptIndianRupeeIcon } from "lucide-react";
import { toast } from "sonner";
import { InvoiceReaderDialog, type ReaderResult } from "@/components/invoice-reader";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fetchAppFile } from "@/lib/app-file";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { billDueDate, matchBill } from "@/lib/bill-calc";
import { formatAmount, formatDate, formatINR, formatQty, toNumber } from "@/lib/format";
import { round2 } from "@/lib/po-calc";
import type { UnitItem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { saveBill } from "../actions";
import { InvoiceFiles, type InvoiceFile } from "../invoice-files";

export type BillLineCtx = {
  grnItemId: number;
  description: string;
  sku: string;
  uom: string;
  acceptedQty: number;
  receivedQty: number;
  invoiceQty: number | null;
  poRate: number;
  gstRate: number;
  /** The item's own unit, pack and conversions. */
  unitItem?: UnitItem;
};

type Initial = {
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: string;
  taxAmount: string;
  otherCharges: string;
  totalAmount: string;
  otherDebit: string;
  otherDebitReason: string;
  remarks: string;
  lines: Record<number, { billedQty: string; billedRate: string }>;
};

// Blank = 0; pasted "66,750.00" or "₹ 6,675" count as numbers.
const n = (v: string) => toNumber(v);

export function BillForm({
  grnId,
  lines,
  initial,
  creditDays,
  msme,
  acceptedAt,
  editing,
  returnTo,
  invoiceFiles,
  vendorGstin,
  poNumber,
}: {
  returnTo?: string | null;
  grnId: number;
  /** Invoice copies already attached to the receipt. */
  invoiceFiles: InvoiceFile[];
  lines: BillLineCtx[];
  initial: Initial;
  creditDays: number;
  msme: boolean;
  acceptedAt: string | null;
  editing: boolean;
  vendorGstin?: string | null;
  poNumber?: string | null;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [f, setF] = useState(initial);
  const set = (patch: Partial<Initial>) => setF((cur) => ({ ...cur, ...patch }));
  const setLine = (id: number, patch: Partial<{ billedQty: string; billedRate: string }>) =>
    setF((cur) => ({ ...cur, lines: { ...cur.lines, [id]: { ...cur.lines[id], ...patch } } }));

  const m = useMemo(
    () =>
      matchBill({
        lines: lines.map((l) => ({ ...l, billedQty: n(f.lines[l.grnItemId].billedQty), billedRate: n(f.lines[l.grnItemId].billedRate) })),
        otherCharges: n(f.otherCharges),
        otherDebit: n(f.otherDebit),
        totalAmount: n(f.totalAmount),
      }),
    [lines, f],
  );
  const linesTaxable = round2(m.lines.reduce((s, l) => s + l.billedTaxable, 0));
  const linesTax = round2(m.lines.reduce((s, l) => s + (l.billedTaxable * l.gstRate) / 100, 0));
  // "Read invoice": an attached invoice copy, or another file.
  const picker = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<File | null>(null);
  const [opening, setOpening] = useState(false);
  async function readAttached(file: InvoiceFile) {
    setOpening(true);
    try {
      const blob = await fetchAppFile(`/api/documents/${file.id}`);
      setReading(new File([blob], file.fileName, { type: blob.type || (/\.pdf$/i.test(file.fileName) ? "application/pdf" : "") }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  function fillFromInvoice({ fields, lines: read }: ReaderResult) {
    setF((cur) => ({
      ...cur,
      invoiceNo: fields.invoiceNo ?? cur.invoiceNo,
      invoiceDate: fields.invoiceDate ?? cur.invoiceDate,
      taxableAmount: fields.taxable ?? cur.taxableAmount,
      taxAmount: fields.tax ?? cur.taxAmount,
      otherCharges: fields.otherCharges ?? cur.otherCharges,
      totalAmount: fields.total ?? cur.totalAmount,
      lines: { ...cur.lines, ...Object.fromEntries(read.map((l) => [l.key, { billedQty: l.qty, billedRate: l.rate ?? cur.lines[l.key].billedRate }])) },
    }));
    const n = Object.keys(fields).length + read.length;
    toast.success(`Filled ${n} value${n === 1 ? "" : "s"} from the invoice. Check them before saving.`);
  }

  const due = f.invoiceDate
    ? billDueDate({ invoiceDate: new Date(f.invoiceDate), acceptedAt: acceptedAt ? new Date(acceptedAt) : null, creditDays, msme })
    : null;

  function submit() {
    run(
      () =>
        saveBill(grnId, {
          ...f,
          lines: lines.map((l) => ({ grnItemId: l.grnItemId, ...f.lines[l.grnItemId] })),
        }),
      {
        pending: "Saving bill…",
        success: (data) => (data.debit ? `${data.billNumber} saved with debit ${formatINR(data.debit)}` : `${data.billNumber} saved — matched`),
        onSuccess: (data) => router.push(returnTo ?? `/bills/${data.id}`),
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Billed vs accepted</CardTitle>
          <CardDescription>Enter quantity and rate as printed on the invoice. Anything above the accepted quantity or the PO rate is debited.</CardDescription>
          <CardAction>
            <input ref={picker} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setReading(e.target.files?.[0] ?? null)} />
            {invoiceFiles.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={opening}>
                    {opening ? <Loader2Icon className="animate-spin" /> : <FileSearchIcon />}
                    Read invoice
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {invoiceFiles.map((file) => (
                    <DropdownMenuItem key={file.id} onSelect={() => void readAttached(file)}>
                      {file.fileName}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => picker.current?.click()}>Another file…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" onClick={() => picker.current?.click()}>
                <FileSearchIcon />
                Read invoice
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <InvoiceReaderDialog
          file={reading}
          onClose={() => {
            setReading(null);
            if (picker.current) picker.current.value = "";
          }}
          fields={["invoiceNo", "invoiceDate", "taxable", "tax", "otherCharges", "total"]}
          lineRate
          targets={lines.map((l) => ({
            key: l.grnItemId,
            label: l.description,
            description: l.description,
            sku: l.sku,
            uom: l.uom,
            unitItem: l.unitItem,
            rate: l.poRate,
            qty: l.acceptedQty,
          }))}
          vendorGstin={vendorGstin}
          orderNo={poNumber}
          onApply={fillFromInvoice}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="py-2.5 pl-4">Item</th>
                <th className="py-2.5 pr-3 text-right">Accepted</th>
                <th className="py-2.5 pr-3 text-right">PO rate</th>
                <th className="w-36 py-2.5 pr-3">Billed qty</th>
                <th className="w-36 py-2.5 pr-3">Billed rate</th>
                <th className="py-2.5 pr-3 text-right">Billed value</th>
                <th className="py-2.5 pr-4 text-right">Debit (incl. GST)</th>
              </tr>
            </thead>
            <tbody>
              {m.lines.map((l, i) => {
                const src = lines[i];
                const row = f.lines[src.grnItemId];
                return (
                  <tr key={src.grnItemId} className={cn("border-b align-top last:border-b-0", l.debit > 0 && "bg-rose-50/60 dark:bg-rose-950/20")}>
                    <td className="py-3 pl-4">
                      <div className="font-medium">{src.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {src.sku} · GST {formatQty(src.gstRate)}% · received {formatQty(src.receivedQty)}
                        {src.invoiceQty !== null ? `, challan ${formatQty(src.invoiceQty)}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular">
                      {formatQty(src.acceptedQty)} <span className="text-muted-foreground">{src.uom}</span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular">₹{formatAmount(src.poRate)}</td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={row.billedQty} onChange={(e) => setLine(src.grnItemId, { billedQty: e.target.value })} className="text-right tabular" aria-label={`${src.description} billed quantity`} />
                      {l.qtyDiff > 0 && <div className="mt-1 text-right text-xs text-rose-600">+{formatQty(l.qtyDiff)} over accepted</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={row.billedRate} onChange={(e) => setLine(src.grnItemId, { billedRate: e.target.value })} className="text-right tabular" aria-label={`${src.description} billed rate`} />
                      {l.rateDiff > 0 && <div className="mt-1 text-right text-xs text-rose-600">+₹{formatAmount(l.rateDiff)} over PO</div>}
                    </td>
                    <td className="py-3 pr-3 text-right tabular">{formatAmount(l.billedTaxable)}</td>
                    <td className={cn("py-3 pr-4 text-right font-medium tabular", l.debit > 0 ? "text-rose-600" : "text-muted-foreground")}>
                      {l.debit > 0 ? formatAmount(l.debit) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="b-no">
                Invoice no.<span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="b-no" value={f.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-date">
                Invoice date<span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="b-date" type="date" value={f.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-taxable">Taxable value (₹)</FieldLabel>
              <Input id="b-taxable" inputMode="decimal" value={f.taxableAmount} onChange={(e) => set({ taxableAmount: e.target.value })} className="tabular" />
              <FieldDescription>
                From lines: {formatAmount(linesTaxable)}{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => set({ taxableAmount: String(linesTaxable), taxAmount: String(linesTax) })}>
                  use
                </button>
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="b-tax">GST (₹)</FieldLabel>
              <Input id="b-tax" inputMode="decimal" value={f.taxAmount} onChange={(e) => set({ taxAmount: e.target.value })} className="tabular" />
              <FieldDescription>From lines: {formatAmount(linesTax)}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="b-other">Freight / other charges billed (₹)</FieldLabel>
              <Input id="b-other" inputMode="decimal" value={f.otherCharges} onChange={(e) => set({ otherCharges: e.target.value })} className="tabular" />
            </Field>
            <Field>
              <FieldLabel htmlFor="b-total">
                Invoice total (₹)<span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="b-total" inputMode="decimal" value={f.totalAmount} onChange={(e) => set({ totalAmount: e.target.value })} className="tabular" />
              {Math.abs(m.totalVariance) >= 1 && n(f.totalAmount) > 0 && (
                <FieldDescription className="text-amber-700 dark:text-amber-400">
                  Differs from the lines + GST + charges ({formatAmount(m.billedComputed)}) by {formatAmount(m.totalVariance)}
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="b-odebit">Other deduction (₹)</FieldLabel>
              <Input id="b-odebit" inputMode="decimal" value={f.otherDebit} onChange={(e) => set({ otherDebit: e.target.value })} className="tabular" />
              <FieldDescription>e.g. late delivery penalty, freight not agreed</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="b-oreason">Reason for deduction</FieldLabel>
              <Input id="b-oreason" value={f.otherDebitReason} onChange={(e) => set({ otherDebitReason: e.target.value })} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="b-remarks">Remarks</FieldLabel>
              <Textarea id="b-remarks" rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-sm font-medium">Invoice copy</div>
              <InvoiceFiles grnId={grnId} files={invoiceFiles} canEdit />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {m.debitAmount > 0 ? <AlertTriangleIcon className="size-4 text-rose-600" /> : <CheckCircle2Icon className="size-4 text-emerald-600" />}
              {m.debitAmount > 0 ? "Mismatch — debit note" : "Matched"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Should be (accepted × PO rate + GST)" value={formatINR(m.expectedAmount)} />
              <Row label="Invoice total" value={formatINR(n(f.totalAmount))} />
              <Row label="Debit for excess qty / rate" value={formatINR(m.lineDebit)} tone={m.lineDebit > 0 ? "bad" : undefined} />
              {n(f.otherDebit) > 0 && <Row label="Other deduction" value={formatINR(n(f.otherDebit))} tone="bad" />}
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-medium">Payable</dt>
                <dd className="text-lg font-semibold tabular">{formatINR(m.payableAmount)}</dd>
              </div>
              {due && (
                <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                  Due <strong>{formatDate(due.dueDate)}</strong> ·{" "}
                  {msme ? `MSME: ${due.days} days from acceptance (max 45)` : `${due.days} days credit from invoice date`}
                </p>
              )}
            </dl>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" asChild>
                <Link href={`/goods-receipts/${grnId}`}>Cancel</Link>
              </Button>
              <Button className="flex-1" onClick={submit} disabled={pending || !f.invoiceNo.trim() || !f.invoiceDate || n(f.totalAmount) <= 0}>
                {pending ? <Loader2Icon className="animate-spin" /> : <ReceiptIndianRupeeIcon />}
                {editing ? "Update bill" : "Save bill"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", tone === "bad" && "font-medium text-rose-600")}>{value}</dd>
    </div>
  );
}
