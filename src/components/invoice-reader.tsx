"use client";

/**
 * "Read invoice": reads a vendor invoice (PDF or photo) in the browser with fixed rules — no AI,
 * nothing sent anywhere — and shows what it found for review. Each value says where it was read
 * from; worked-out or doubtful values are marked. Nothing changes in the form until the user picks
 * the values and clicks "Fill form".
 */
import { useEffect, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, FileSearchIcon, Loader2Icon, ScanTextIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmount, formatQty } from "@/lib/format";
import { convert, matchLines, type MatchTarget } from "@/lib/invoice-reader/match";
import { readInvoiceWithAi } from "@/lib/ai-invoice";
import { aiReading } from "@/lib/invoice-reader/ai";
import { readFileText } from "@/lib/invoice-reader/read-file";
import { billFigures, readInvoiceText, type InvoiceReading } from "@/lib/invoice-reader/reading";
import { cn } from "@/lib/utils";

export type ReaderField = "invoiceNo" | "invoiceDate" | "vehicleNo" | "challanNo" | "lrNo" | "total" | "taxable" | "tax" | "otherCharges";

const LABEL: Record<ReaderField, string> = {
  invoiceNo: "Invoice no.",
  invoiceDate: "Invoice date",
  vehicleNo: "Vehicle no.",
  challanNo: "Delivery challan no.",
  lrNo: "Bilty / LR no.",
  total: "Invoice total (₹)",
  taxable: "Taxable value of items (₹)",
  tax: "GST on items (₹)",
  otherCharges: "Freight / other charges incl. GST (₹)",
};

export type ReaderTarget = MatchTarget & { label: string };

export type ReaderResult = {
  fields: Partial<Record<ReaderField, string>>;
  lines: { key: number; qty: string; rate: string | null }[];
};

type FieldRow = { key: ReaderField; value: string; from: string; note: string | null; use: boolean };
type LineRow = { target: number | null; qty: string; rate: string; use: boolean };

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(n * 1000) / 1000));

function fieldRows(r: InvoiceReading, wanted: ReaderField[]): FieldRow[] {
  const money = billFigures(r);
  const t = r.totals;
  const candidates: Partial<Record<ReaderField, { value: string; from: string; note?: string | null }>> = {
    invoiceNo: r.header.invoiceNo && { value: r.header.invoiceNo.value, from: r.header.invoiceNo.from },
    invoiceDate: r.header.invoiceDate && { value: r.header.invoiceDate.value, from: r.header.invoiceDate.from },
    vehicleNo: r.header.vehicleNo && { value: r.header.vehicleNo.value, from: r.header.vehicleNo.from },
    challanNo: r.header.challanNo && { value: r.header.challanNo.value, from: r.header.challanNo.from },
    lrNo: r.header.lrNo && { value: r.header.lrNo.value, from: r.header.lrNo.from },
    total:
      t.grandTotal !== null
        ? t.totalWorkedOut
          ? { value: num(t.grandTotal), from: "Items + charges + GST as read", note: "The total itself couldn't be read — check it" }
          : { value: num(t.grandTotal), from: "The invoice's total", note: t.addsUp === false ? "Items, charges and GST don't add up to it — check" : null }
        : undefined,
    taxable: t.items > 0 ? { value: num(money.taxable), from: `${r.lines.length} item line${r.lines.length === 1 ? "" : "s"} added up` } : undefined,
    tax:
      money.tax !== null
        ? {
            value: num(money.tax),
            from: r.taxes.length ? r.taxes.map((x) => `${x.label} ${formatAmount(x.amount)}`).join(" + ") : "Total − items − charges",
            note: t.taxWorkedOut ? `Worked out from the total${t.taxRead !== null ? ` (read as ${formatAmount(t.taxRead)})` : ""}` : null,
          }
        : undefined,
    otherCharges:
      r.charges.length > 0
        ? {
            value: num(money.otherCharges),
            from: r.charges.map((c) => `${c.description || "Charge"} ${formatAmount(c.amount)}`).join(" + "),
            note: money.otherCharges !== r.totals.charges ? `Includes GST ${formatAmount(money.otherCharges - r.totals.charges)}` : null,
          }
        : undefined,
  };
  return wanted.flatMap((key) => {
    const c = candidates[key];
    return c ? [{ key, value: c.value, from: c.from, note: c.note ?? null, use: true }] : [];
  });
}

function lineRow(line: InvoiceReading["lines"][number], target: ReaderTarget | undefined): LineRow {
  if (!target) return { target: null, qty: num(line.qty), rate: num(line.rate), use: false };
  const c = convert(line, target);
  // Units that can't be converted (KGS on the invoice, Bale on the PO): nothing filled until the user enters it.
  if (c.unitProblem) return { target: target.key, qty: "", rate: "", use: false };
  return { target: target.key, qty: num(c.qty), rate: num(c.rate), use: true };
}

export function InvoiceReaderDialog({
  file,
  onClose,
  fields,
  lineRate,
  targets,
  vendorGstin,
  orderNo,
  onApply,
}: {
  /** The invoice to read; null = closed. */
  file: (Blob & { name?: string }) | null;
  onClose: () => void;
  /** The form's fields this may fill. */
  fields: ReaderField[];
  /** Also fill each line's rate (the bill). */
  lineRate: boolean;
  /** The PO / receipt lines invoice lines can go to. */
  targets: ReaderTarget[];
  vendorGstin?: string | null;
  /** This PO's number, compared with the buyer's order no. on the invoice. */
  orderNo?: string | null;
  onApply: (result: ReaderResult) => void;
}) {
  const [progress, setProgress] = useState<{ message: string; fraction?: number }>({ message: "Opening the invoice…" });
  const [reading, setReading] = useState<InvoiceReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [ai, setAi] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  /** Show a reading (rules or AI): its fields and its lines matched to the form's lines. */
  function show(r: InvoiceReading) {
    const matches = matchLines(r.lines, targets);
    setReading(r);
    setRows(fieldRows(r, fields));
    setLines(r.lines.map((l, i) => lineRow(l, targets.find((t) => t.key === matches[i].target))));
  }

  /** Read the same file with AI (Gemini, via the server); the result is checked the same way. */
  function readWithAi() {
    if (!file) return;
    setAi({ busy: true, error: null });
    readInvoiceWithAi(file)
      .then(({ invoice }) => {
        setError(null);
        show(aiReading(invoice));
        setAi({ busy: false, error: null });
      })
      .catch((e: Error) => setAi({ busy: false, error: e.message }));
  }

  useEffect(() => {
    if (!file) return;
    let live = true;
    readFileText(file, (message, fraction) => live && setProgress({ message, fraction }))
      .then((doc) => {
        if (live) show(readInvoiceText(doc));
      })
      .catch((e: Error) => live && setError(e.message || "Couldn't read this file."));
    return () => {
      live = false;
      setReading(null);
      setError(null);
      setAi({ busy: false, error: null });
      setProgress({ message: "Opening the invoice…" });
    };
    // Targets and fields are fixed for a form; reading again only for a new file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const setRow = (i: number, patch: Partial<FieldRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setLine = (i: number, patch: Partial<LineRow>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const pickTarget = (i: number, key: number | null) => {
    // One invoice line per PO line: a line that had this PO line gives it up.
    setLines((ls) =>
      ls.map((l, k) => {
        if (k === i) return lineRow(reading!.lines[i], targets.find((t) => t.key === key));
        return key !== null && l.target === key ? { ...l, target: null, use: false } : l;
      }),
    );
  };

  const usable = (l: LineRow) => l.use && l.target !== null && l.qty.trim() !== "";
  const chosen = rows.filter((r) => r.use && r.value.trim()).length + lines.filter(usable).length;
  const apply = () => {
    onApply({
      fields: Object.fromEntries(rows.filter((r) => r.use && r.value.trim()).map((r) => [r.key, r.value.trim()])),
      lines: lines.filter(usable).map((l) => ({ key: l.target!, qty: l.qty, rate: lineRate ? l.rate : null })),
    });
    onClose();
  };

  const vendorFound = vendorGstin && reading ? reading.gstins.includes(vendorGstin.toUpperCase()) : null;
  const invoiceOrder = reading?.header.orderNo?.value;

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearchIcon className="size-4" />
            Read invoice{file?.name ? `: ${file.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {reading?.source === "ai"
              ? "Read by AI (Gemini). Tick what to use; nothing changes until you click Fill form."
              : "Read in your browser by fixed rules. Tick what to use; nothing changes until you click Fill form."}
          </DialogDescription>
        </DialogHeader>

        {/* AI reading: for invoices the rules can't read well (poor photos, unusual layouts). */}
        {(reading || error) && reading?.source !== "ai" && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/30">
            <SparklesIcon className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="min-w-0 flex-1">
              {error || reading?.warnings.length || reading?.noTable || reading?.totals.addsUp === false
                ? "Some values couldn't be read. Try reading this invoice with AI."
                : "Values look off? Read this invoice with AI instead."}
              <span className="block text-xs text-muted-foreground">Sends this one file to Google Gemini; nothing fills the form until you click Fill form.</span>
            </span>
            <Button size="sm" variant="outline" onClick={readWithAi} disabled={ai.busy}>
              {ai.busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {ai.busy ? "Reading with AI…" : "Read with AI"}
            </Button>
            {ai.error && <span className="w-full text-xs text-destructive">{ai.error}</span>}
          </div>
        )}

        {error && !reading ? (
          <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangleIcon className="size-4 shrink-0" />
            {error}
          </p>
        ) : !reading ? (
          <div className="space-y-3 py-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {progress.message}
            </p>
            {progress.fraction !== undefined && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
            )}
          </div>
        ) : (
          <div className="-mx-6 max-h-[65vh] space-y-5 overflow-y-auto px-6">
            <div className="flex flex-wrap gap-2 text-xs">
              {reading.source === "ai" ? (
                <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
                  <SparklesIcon /> Read by AI (Gemini) — check each value
                </Badge>
              ) : reading.source === "ocr" ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <ScanTextIcon /> Scanned copy, read by OCR — check each value
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <CheckCircle2Icon /> Read from the PDF&apos;s text
                </Badge>
              )}
              {reading.totals.addsUp !== null && (
                <Badge variant="outline" className={reading.totals.addsUp ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-amber-300 text-amber-800 dark:text-amber-300"}>
                  {reading.totals.addsUp ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
                  Items {formatAmount(reading.totals.items)}
                  {reading.totals.charges ? ` + charges ${formatAmount(reading.totals.charges)}` : ""}
                  {reading.totals.tax !== null ? ` + GST ${formatAmount(reading.totals.tax)}` : ""}
                  {reading.totals.addsUp ? ` = total ${formatAmount(reading.totals.grandTotal!)}` : ` ≠ total ${formatAmount(reading.totals.grandTotal!)} (by ${formatAmount(reading.totals.difference!)})`}
                </Badge>
              )}
              {vendorGstin && (
                <Badge variant="outline" className={vendorFound ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-amber-300 text-amber-800 dark:text-amber-300"}>
                  {vendorFound ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
                  {vendorFound ? `Vendor GSTIN ${vendorGstin} found` : `Vendor GSTIN ${vendorGstin} not found on the invoice${reading.source === "ocr" ? " (may be unreadable)" : ""}`}
                </Badge>
              )}
              {invoiceOrder && (
                <Badge variant="outline">
                  Buyer&apos;s order no. on invoice: {invoiceOrder}
                  {orderNo ? ` (this PO: ${orderNo})` : ""}
                </Badge>
              )}
            </div>

            {reading.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {reading.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            {rows.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Invoice details</h3>
                <div className="divide-y rounded-lg border">
                  {rows.map((r, i) => (
                    <label key={r.key} className="grid grid-cols-[auto_minmax(0,11rem)_minmax(0,1fr)] items-start gap-3 px-3 py-2 sm:grid-cols-[auto_12rem_14rem_minmax(0,1fr)]">
                      <Checkbox checked={r.use} onCheckedChange={(c) => setRow(i, { use: c === true })} className="mt-2" aria-label={`Use ${LABEL[r.key]}`} />
                      <span className="pt-1.5 text-sm">{LABEL[r.key]}</span>
                      <Input
                        value={r.value}
                        type={r.key === "invoiceDate" ? "date" : "text"}
                        inputMode={["total", "taxable", "tax", "otherCharges"].includes(r.key) ? "decimal" : undefined}
                        onChange={(e) => setRow(i, { value: e.target.value, use: true })}
                        className="h-8 tabular"
                      />
                      <span className="col-span-2 col-start-2 text-xs text-muted-foreground sm:col-span-1 sm:col-start-auto sm:pt-1.5">
                        <span className="break-words">{r.from}</span>
                        {r.note && <span className="block text-amber-700 dark:text-amber-400">{r.note}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Items</h3>
              {reading.lines.length === 0 ? (
                <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                  <AlertTriangleIcon className="size-4 shrink-0" />
                  {reading.noTable ? "No item table recognised on this invoice." : "No item lines could be read."} Enter the quantities by hand.
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {reading.lines.map((l, i) => {
                    const row = lines[i];
                    const target = targets.find((t) => t.key === row.target);
                    const c = target ? convert(l, target) : null;
                    return (
                      <div key={i} className={cn("grid gap-2 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_16rem]", !row.use && "opacity-70")}>
                        <Checkbox checked={row.use} disabled={row.target === null} onCheckedChange={(v) => setLine(i, { use: v === true })} className="mt-1" aria-label={`Use line ${i + 1}`} />
                        <div className="min-w-0 text-sm">
                          <div className="font-medium break-words">{l.description || `Line ${i + 1}`}</div>
                          <div className="text-xs text-muted-foreground tabular">
                            {l.qty !== null ? `${formatQty(l.qty)} ${l.unit?.toUpperCase() ?? ""}` : "qty ?"} × {l.rate !== null ? `₹${formatAmount(l.rate)}` : "rate ?"} = {l.amount !== null ? `₹${formatAmount(l.amount)}` : "?"}
                            {l.hsn ? ` · HSN ${l.hsn}` : ""}
                          </div>
                          {l.notes.map((n) => (
                            <div key={n} className={cn("text-xs", l.consistent ? "text-amber-700 dark:text-amber-400" : "text-destructive")}>
                              {n}
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1.5 sm:col-start-3">
                          <Select value={row.target === null ? "none" : String(row.target)} onValueChange={(v) => pickTarget(i, v === "none" ? null : Number(v))}>
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not on this receipt</SelectItem>
                              {targets.map((t) => (
                                <SelectItem key={t.key} value={String(t.key)}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {target && (
                            <div className="flex items-center gap-1.5">
                              <Input value={row.qty} onChange={(e) => setLine(i, { qty: e.target.value, use: e.target.value.trim() !== "" })} inputMode="decimal" className="h-8 text-right tabular" aria-label="Quantity" />
                              <span className="shrink-0 text-xs text-muted-foreground">{target.uom}</span>
                              {lineRate && (
                                <>
                                  <span className="text-xs text-muted-foreground">@ ₹</span>
                                  <Input value={row.rate} onChange={(e) => setLine(i, { rate: e.target.value })} inputMode="decimal" className="h-8 text-right tabular" aria-label="Rate" />
                                </>
                              )}
                            </div>
                          )}
                          {c?.note && <div className={cn("text-xs", c.unitProblem ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{c.note}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!reading || chosen === 0}>
            Fill form{reading ? ` (${chosen})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
