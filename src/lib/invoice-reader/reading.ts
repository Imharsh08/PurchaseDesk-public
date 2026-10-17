/**
 * An invoice read without AI: header fields, item lines, charges, GST and totals, from text with
 * positions (src/lib/invoice-reader/read-file.ts gets it from a PDF or by OCR). Every line is
 * checked (quantity × rate = amount) and the totals are added up, so misread values are repaired
 * where the arithmetic allows and flagged where it doesn't. Nothing here fills a form: the review
 * dialog shows the result and the user picks what to use.
 */
import { groupIntoLines, type DocText, type Line } from "./geometry";
import { readHeader, type Found, type HeaderKey } from "./header";
import { findGstins, isRound, parseNumber } from "./parse";
import { readTable, type TableRow } from "./table";

export type InvoiceLine = {
  description: string;
  hsn: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  /** Quantity × rate = amount (as read, or after working one of them out). */
  consistent: boolean;
  notes: string[];
};

export type InvoiceReading = {
  /** PDF text, OCR of a scan or photo, or Gemini (AI) when asked for. */
  source: DocText["source"] | "ai";
  header: Partial<Record<HeaderKey, Found<string>>>;
  gstins: string[];
  lines: InvoiceLine[];
  charges: { description: string; amount: number; percent: number | null }[];
  taxes: { label: string; amount: number }[];
  totals: {
    items: number;
    charges: number;
    tax: number | null;
    /** GST worked out as total − items − charges (the tax lines were unreadable or didn't add up). */
    taxWorkedOut: boolean;
    /** GST as read, when it was replaced by the worked-out figure. */
    taxRead: number | null;
    roundOff: number;
    grandTotal: number | null;
    /** No total could be read: items + charges + the GST read. */
    totalWorkedOut: boolean;
    /** Items + charges + tax (+ round-off) equals the grand total. Null when there's no total to check. */
    addsUp: boolean | null;
    difference: number | null;
  };
  /** No item table was recognised. */
  noTable: boolean;
  /** Signs that some numbers were misread, in words. */
  warnings: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fits = (q: number, r: number, a: number) => Math.abs(q * r - a) <= Math.max(1, a * 0.002);
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** Printed with its decimals ("320.00", "2,500.000"): such a number is rarely misread. */
const wellFormed = (raw: string | undefined) => !!raw && /\d\.\d{2,3}(?!\d)/.test(raw);

/**
 * What it costs to believe `next` where `read` was printed: nothing when equal; little when OCR
 * plainly dropped a decimal point ("32000" for 320.00, ÷100); otherwise by how far apart they are,
 * five times as much for a cleanly printed number.
 */
function changeCost(next: number, read: number | null, raw: string | undefined) {
  if (read === null) return 0.3;
  if (Math.abs(next - read) <= Math.max(0.001, read * 1e-6)) return 0;
  const k = read / next;
  const zeros = raw && !/[.,]\d{1,3}\b/.test(raw) ? (raw.match(/0+$/)?.[0].length ?? 0) : 0;
  if (zeros >= 2 && [100, 1000].some((f) => Math.abs(k - f) < 1e-6 && Math.log10(f) <= zeros)) return 0.2;
  return (wellFormed(raw) ? 5 : 1) * Math.abs(Math.log(next / read));
}

/**
 * Quantity, rate and amount made consistent. When they disagree, the amount (largest print) is
 * trusted and the quantity or rate is worked out from it — including the reading that a decimal
 * point was lost ("32000" → 320.00) — choosing what stays closest to what was printed.
 */
export function reconcile(r: Pick<TableRow, "description" | "hsn" | "qty" | "unit" | "rate" | "amount" | "raw">): InvoiceLine {
  const { qty: q, rate: rt, amount: a } = r;
  const raw = r.raw ?? {};
  const base = { description: r.description, hsn: r.hsn, unit: r.unit };
  if (q !== null && rt !== null && a !== null && fits(q, rt, a)) return { ...base, qty: q, rate: rt, amount: a, consistent: true, notes: [] };

  const options: { qty: number; rate: number; cost: number }[] = [];
  if (a !== null && a > 0) {
    for (const k of [1, 10, 100, 1000]) {
      if (rt !== null && rt > 0) {
        const rate = rt / k;
        const qty = a / rate;
        if (isRound(qty, 3)) options.push({ qty: round3(qty), rate, cost: changeCost(rate, rt, raw.rate) + changeCost(qty, q, raw.qty) });
      }
      if (q !== null && q > 0) {
        const qty = q / k;
        const rate = a / qty;
        if (isRound(rate, 2)) options.push({ qty, rate: round2(rate), cost: changeCost(qty, q, raw.qty) + changeCost(rate, rt, raw.rate) });
      }
    }
  }
  const best = options.sort((x, y) => x.cost - y.cost)[0];
  if (best) {
    const notes: string[] = [];
    if (q === null || Math.abs(best.qty - q) > 1e-9) notes.push(q === null ? "Quantity worked out from amount ÷ rate" : `Quantity worked out from the amount (read as ${fmt(q)})`);
    if (rt === null || Math.abs(best.rate - rt) > 1e-9) notes.push(rt === null ? "Rate worked out from amount ÷ quantity" : `Rate worked out from the amount (read as ${fmt(rt)})`);
    return { ...base, qty: best.qty, rate: best.rate, amount: a, consistent: true, notes };
  }
  if (q !== null && rt !== null) {
    const amount = round2(q * rt);
    return { ...base, qty: q, rate: rt, amount, consistent: true, notes: [a === null ? "Amount worked out from quantity × rate" : `Amount worked out from quantity × rate (read as ${fmt(a)})`] };
  }
  return { ...base, qty: q, rate: rt, amount: a, consistent: false, notes: ["Couldn't read enough of this line — check it"] };
}

const TAX_LABEL = /\b(i|c|s|ut)\s*\.?\s*gst\b/i;

/** "IGST" / "CGST" / "SGST" / "UTGST", also as OCR reads them ("16ST"); "GST" when unclear. */
function taxName(text: string) {
  const m = text.match(/\b(ut|[i1l|]|c|s)\s*\.?\s*[g6]\s*[s5]\s*[t7]\b/i);
  if (!m) return "GST";
  const k = m[1].toLowerCase();
  return k === "ut" ? "UTGST" : k === "c" ? "CGST" : k === "s" ? "SGST" : "IGST";
}

/**
 * The grand total: the largest amount on a "Total" line (or with "Rs."), else the largest amount
 * on the invoice — counting only amounts that leave a believable GST (0–45% of items + charges),
 * so a misread "5,26,50,000" isn't taken for the total of a ₹9 lakh invoice. On a scan, the
 * total line's amount read again digits-only (`reread`) counts too; an amount that the GST read
 * makes add up exactly wins, then the one read most often.
 */
function grandTotalOf(lines: Line[], base: number, reread: number[], taxRead: number | null) {
  const plausible = (n: number | null): n is number => n !== null && n >= base - 0.5 && n <= base * 1.45;
  const amounts = (l: Line) =>
    l.text
      .split(/\s+/)
      .filter((t) => /[.,]\d/.test(t))
      .map(parseNumber)
      .filter(plausible);
  const labelled = lines.filter((l) => /total|rs\.|₹|payable/i.test(l.text) && !/sub\s*-?\s*total|taxable|total\s*tax/i.test(l.text)).flatMap(amounts);
  const found = [...labelled, ...reread.filter(plausible)];
  if (!found.length) {
    const any = lines.flatMap(amounts);
    return any.length ? Math.max(...any) : null;
  }
  if (taxRead !== null) {
    const exact = found.find((n) => Math.abs(n - base - taxRead) <= 1);
    if (exact !== undefined) return exact;
  }
  const votes = (n: number) => found.filter((m) => Math.abs(m - n) < 0.005).length;
  return [...found].sort((a, b) => votes(b) - votes(a) || b - a)[0];
}

export function readInvoiceText(doc: DocText): InvoiceReading {
  const lines = doc.pages.flatMap((p, i) => groupIntoLines(p.words, i));
  const header = readHeader(lines);
  const gstins = [...new Set(lines.flatMap((l) => findGstins(l.text)))];

  const tables = doc.pages.map((p, page) => readTable(lines, page, p.rereads));
  const rows = tables.flatMap((t) => t?.rows ?? []);
  const totalsReread = tables.flatMap((t) => t?.below ?? []);
  const items = rows.filter((r) => r.kind === "item").map(reconcile);
  const charges = rows
    .filter((r) => r.kind === "charge" && r.amount !== null)
    .map((r) => ({ description: r.description.replace(/\s+/g, " ").trim(), amount: r.amount!, percent: r.percent }));
  let taxes = rows
    .filter((r) => r.kind === "tax" && r.amount !== null)
    .map((r) => ({ label: taxName(r.description), amount: r.amount! }));
  const roundOff = rows.filter((r) => r.kind === "roundoff").reduce((s, r) => s + (r.amount ?? 0), 0);

  const itemsTotal = round2(items.reduce((s, l) => s + (l.amount ?? 0), 0));
  const chargesTotal = round2(charges.reduce((s, c) => s + c.amount, 0));

  // A tax line whose label OCR couldn't read: an unlabelled amount below the items that is exactly
  // a GST rate of items + charges (18% of 9,33,500 = 1,68,030), or two equal halves (CGST + SGST).
  if (!taxes.length && itemsTotal > 0) {
    const base = itemsTotal + chargesTotal;
    const lastItem = Math.max(...rows.filter((r) => r.kind === "item").map((r) => r.y));
    const loose = rows.filter((r) => r.kind === "other" && r.amount !== null && r.y > lastItem);
    const atRate = (amount: number, rates: number[]) => rates.some((p) => Math.abs((amount / base) * 100 - p) < 0.01);
    const whole = loose.find((r) => atRate(r.amount!, [5, 12, 18, 28]));
    const halves = loose.filter((r) => atRate(r.amount!, [2.5, 6, 9, 14]));
    if (whole) taxes = [{ label: "GST", amount: whole.amount! }];
    else if (halves.length === 2 && halves[0].amount === halves[1].amount) taxes = halves.map((r) => ({ label: "GST", amount: r.amount! }));
  }

  // Tax lines outside the item table ("IGST @18%   1,68,030.00").
  if (!taxes.length) {
    taxes = lines
      .filter((l) => TAX_LABEL.test(l.text) && !/taxable|hsn/i.test(l.text))
      .map((l) => {
        const nums = l.text.split(/\s+/).filter((t) => /[.,]\d/.test(t)).map(parseNumber).filter((n): n is number => n !== null && n < itemsTotal);
        return { label: taxName(l.text), amount: nums.length ? nums[nums.length - 1] : 0 };
      })
      .filter((t) => t.amount > 0)
      .slice(0, 2);
  }

  let tax: number | null = taxes.length ? round2(taxes.reduce((s, t) => s + t.amount, 0)) : null;
  const grandTotal = itemsTotal > 0 ? grandTotalOf(lines, itemsTotal + chargesTotal, totalsReread, tax) : null;
  const taxAsRead = tax;
  let taxWorkedOut = false;
  const sum = (t: number) => round2(itemsTotal + chargesTotal + t);
  // Round-off has no reliable sign on a scan: use the one that makes the total add up.
  const withRound = (t: number) => (grandTotal === null ? sum(t) + roundOff : Math.abs(sum(t) + roundOff - grandTotal) <= Math.abs(sum(t) - roundOff - grandTotal) ? sum(t) + roundOff : sum(t) - roundOff);
  if (grandTotal !== null && (tax === null || Math.abs(withRound(tax) - grandTotal) > 1)) {
    const derived = round2(grandTotal - itemsTotal - chargesTotal);
    // Only believable as GST if it's a sensible share (up to 28% plus cess).
    if (derived >= 0 && derived <= (itemsTotal + chargesTotal) * 0.4 && (tax === null || Math.abs(sum(derived) - grandTotal) <= 1)) {
      tax = derived;
      taxWorkedOut = true;
    }
  }
  const computed = tax === null ? null : withRound(tax);
  const difference = grandTotal !== null && computed !== null ? round2(grandTotal - computed) : null;

  const warnings: string[] = [];
  items.forEach((l, i) => {
    if (!l.consistent || l.notes.some((n) => n.startsWith("Amount worked out"))) warnings.push(`Line ${i + 1}'s amount couldn't be read, so the totals can't be trusted — check them.`);
  });
  if (tax !== null && itemsTotal + chargesTotal > 0 && tax / (itemsTotal + chargesTotal) > 0.3) {
    warnings.push(`GST comes to ${Math.round((tax / (itemsTotal + chargesTotal)) * 100)}% of the items — some amounts were probably misread.`);
  }

  return {
    source: doc.source,
    header,
    gstins,
    lines: items,
    charges,
    taxes,
    totals: {
      items: itemsTotal,
      charges: chargesTotal,
      tax,
      taxWorkedOut,
      taxRead: taxWorkedOut ? taxAsRead : null,
      roundOff,
      grandTotal: grandTotal ?? (computed !== null && taxes.length ? computed : null),
      totalWorkedOut: grandTotal === null && computed !== null && taxes.length > 0,
      addsUp: difference === null ? null : Math.abs(difference) <= 1,
      difference,
    },
    noTable: rows.length === 0,
    warnings,
  };
}

const SLABS = [5, 12, 18, 28];

/**
 * The bill form's figures: items' taxable value and GST, and other charges *including* their GST
 * (the form adds charges to the lines + their GST). A charge's GST is its own % when printed
 * ("Freight 18%"), else the invoice's overall GST rate, rounded to a GST slab.
 */
export function billFigures(r: InvoiceReading) {
  const { items, charges, tax } = r.totals;
  const overall = tax !== null && items + charges > 0 ? (tax / (items + charges)) * 100 : null;
  const slab = overall === null ? null : SLABS.reduce((best, s) => (Math.abs(s - overall) < Math.abs(best - overall) ? s : best), SLABS[0]);
  const chargeGst = round2(r.charges.reduce((s, c) => s + (c.amount * (c.percent ?? slab ?? 0)) / 100, 0));
  return {
    taxable: items,
    tax: tax === null ? null : round2(tax - chargeGst),
    otherCharges: tax === null ? round2(charges) : round2(charges + chargeGst),
    total: r.totals.grandTotal,
  };
}
