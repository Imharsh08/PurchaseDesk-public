/**
 * An invoice as Gemini read it (api/routes/ai.ts) → the same InvoiceReading the rules produce, so
 * it goes through the same checks: every line's quantity × rate = amount (a slip is worked out
 * from the other two, with a note) and items + charges + GST against the total. Pure.
 */
import { findGstins, isValidGstin, parseDate } from "./parse";
import { reconcile, type InvoiceReading } from "./reading";
import { unitOf } from "./table";

type N = number | null | undefined;
type S = string | null | undefined;
export type AiInvoice = {
  invoiceNo?: S;
  invoiceDate?: S;
  orderNo?: S;
  ewayBill?: S;
  vehicleNo?: S;
  challanNo?: S;
  lrNo?: S;
  gstins?: string[] | null;
  lines?: { description?: S; hsn?: S; qty?: N; unit?: S; rate?: N; amount?: N }[] | null;
  charges?: { description?: S; amount?: N; percent?: N }[] | null;
  taxes?: { label?: S; amount?: N }[] | null;
  roundOff?: N;
  grandTotal?: N;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const n = (v: N) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: S) => (typeof v === "string" && v.trim() ? v.trim() : null);
const FROM = "Read by AI";

export function aiReading(ai: AiInvoice): InvoiceReading {
  const header: InvoiceReading["header"] = {};
  const put = (key: keyof InvoiceReading["header"], value: string | null) => {
    if (value) header[key] = { value, from: FROM, page: 0, line: 0 };
  };
  put("invoiceNo", s(ai.invoiceNo));
  const date = s(ai.invoiceDate);
  put("invoiceDate", date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date ? parseDate(date) : null);
  put("orderNo", s(ai.orderNo));
  put("ewayBill", s(ai.ewayBill));
  put("vehicleNo", s(ai.vehicleNo)?.replace(/\s+/g, "").toUpperCase() ?? null);
  put("challanNo", s(ai.challanNo));
  put("lrNo", s(ai.lrNo));

  const lines = (ai.lines ?? []).map((l) =>
    reconcile({
      description: (s(l.description) ?? "").replace(/\s+/g, " "),
      hsn: s(l.hsn)?.replace(/\D/g, "") || null,
      qty: n(l.qty),
      unit: s(l.unit) ? (unitOf(s(l.unit)!) ?? s(l.unit)!.toLowerCase()) : null,
      rate: n(l.rate),
      amount: n(l.amount),
      raw: {},
    }),
  );
  const charges = (ai.charges ?? []).filter((c) => n(c.amount)).map((c) => ({ description: s(c.description) ?? "Charges", amount: n(c.amount)!, percent: n(c.percent) }));
  const taxes = (ai.taxes ?? []).filter((t) => n(t.amount)).map((t) => ({ label: (s(t.label) ?? "GST").toUpperCase(), amount: n(t.amount)! }));

  const items = r2(lines.reduce((sum, l) => sum + (l.amount ?? 0), 0));
  const chargesTotal = r2(charges.reduce((sum, c) => sum + c.amount, 0));
  const tax = taxes.length ? r2(taxes.reduce((sum, t) => sum + t.amount, 0)) : null;
  const roundOff = n(ai.roundOff) ?? 0;
  const grandTotal = n(ai.grandTotal);
  const computed = tax === null ? null : r2(items + chargesTotal + tax + roundOff);
  const difference = grandTotal !== null && computed !== null ? r2(grandTotal - computed) : null;

  const warnings: string[] = [];
  lines.forEach((l, i) => {
    if (!l.consistent) warnings.push(`Line ${i + 1}: quantity × rate ≠ amount — check it.`);
  });
  if (difference !== null && Math.abs(difference) > 1) warnings.push(`Items, charges and GST differ from the total by ${Math.abs(difference).toLocaleString("en-IN")} — check them.`);

  return {
    source: "ai",
    header,
    // Only GSTINs whose check character agrees (an AI can misread one too).
    gstins: [...new Set((ai.gstins ?? []).flatMap((g) => (isValidGstin(g.replace(/\s/g, "").toUpperCase()) ? [g.replace(/\s/g, "").toUpperCase()] : findGstins(g))))],
    lines,
    charges,
    taxes,
    totals: {
      items,
      charges: chargesTotal,
      tax,
      taxWorkedOut: false,
      taxRead: null,
      roundOff,
      grandTotal,
      totalWorkedOut: false,
      addsUp: difference === null ? null : Math.abs(difference) <= 1,
      difference,
    },
    noTable: lines.length === 0,
    warnings,
  };
}
