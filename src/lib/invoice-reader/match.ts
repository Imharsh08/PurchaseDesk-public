/**
 * Which PO line each invoice line is: scored on the description (words of the PO line found on the
 * invoice line), the rate (against the PO rate) and the quantity (against what is expected), after
 * converting the invoice's unit to the line's with the item's own conversions (2,500 KGS → 100 Bag
 * when 1 Bag = 25 Kg). Each PO line is used once; the user can change every pairing in the review.
 */
import { sameUnit, toItemQty, unitFactor, unitKey, type UnitItem } from "@/lib/units";
import { isRound } from "./parse";
import type { InvoiceLine } from "./reading";

export type MatchTarget = {
  key: number;
  description: string;
  sku?: string | null;
  /** The line's unit (may differ from the item's own). */
  uom: string;
  /** The item's own unit, pack and conversions. */
  unitItem?: UnitItem | null;
  /** PO rate (per `uom`). */
  rate?: number | null;
  /** Quantity expected on this invoice (pending / accepted), in `uom`. */
  qty?: number | null;
};

export type Converted = { qty: number | null; rate: number | null; note: string | null; unitProblem: boolean };

export type LineMatch = { target: number | null; score: number };

const STOP = new Set(["and", "of", "the", "for", "with", "to", "in", "no", "nos", "pcs", "kgs", "kg", "bag", "bags", "per", "size", "type", "grade", "make"]);

/** Words to compare; a name run into its grade ("Royalene580HT") counts as both ("royalene", "580ht"). */
function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/([a-z])(?=\d)/g, "$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function close(a: string, b: string) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  // One letter different, missing or extra (OCR, spelling).
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Share of the PO line's words found on the invoice line, 0–1. Grade / size words with digits
 * ("511", "580ht", "n550") tell similar items apart, so they count double. The SKU is our own code,
 * rarely on a vendor's invoice: only a bonus (the whole SKU found counts as a full match).
 */
export function textScore(invoice: string, target: Pick<MatchTarget, "description" | "sku">) {
  const have = tokens(invoice);
  const sku = target.sku ? tokens(target.sku) : [];
  if (sku.length && sku.every((w) => have.includes(w))) return 1;
  const want = [...new Set(tokens(target.description))];
  if (!want.length) return 0;
  const weight = (w: string) => (/\d/.test(w) ? 2 : 1);
  const total = want.reduce((s, w) => s + weight(w), 0);
  return want.filter((w) => have.some((h) => close(w, h))).reduce((s, w) => s + weight(w), 0) / total;
}

/**
 * The invoice line's quantity and rate in the PO line's unit. A rate exactly 10, 100 or 1000 times
 * off the PO rate is an OCR decimal slip ("32.00" for 320.00, with the quantity read 10× too big so
 * the amount still agrees): both are corrected, with a note.
 */
export function convert(line: Pick<InvoiceLine, "qty" | "rate" | "unit">, target: MatchTarget): Converted {
  const c = convertUnits(line, target);
  if (!target.rate || !c.rate || c.qty === null) return c;
  const R = target.rate;
  if (Math.abs(c.rate - R) / R <= 0.005) return c;
  for (const k of [10, 100, 1000, 0.1, 0.01, 0.001]) {
    const rate = c.rate * k;
    const qty = c.qty / k;
    if (Math.abs(rate - R) / R <= 0.005 && isRound(qty, 3)) {
      const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
      const note = `Read as ${fmt(c.qty)} × ${fmt(c.rate)}; the PO rate ${fmt(R)} fits with the decimal point moved — check`;
      return { qty: Math.round(qty * 1000) / 1000, rate: Math.round(rate * 100) / 100, note: c.note ? `${c.note}. ${note}` : note, unitProblem: c.unitProblem };
    }
  }
  return c;
}

function convertUnits(line: Pick<InvoiceLine, "qty" | "rate" | "unit">, target: MatchTarget): Converted {
  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  if (!line.unit) return { qty: line.qty, rate: line.rate, note: `Unit not read: taken as ${target.uom}`, unitProblem: false };
  if (sameUnit(line.unit, target.uom)) return { qty: line.qty, rate: line.rate, note: null, unitProblem: false };
  // How many of the line's unit one invoice unit is: through the item's own unit and conversions
  // (1 Bag = 25 Kg, so 1 Kg = 0.04 Bag); without them, only standard measures (Ton → Kg).
  let one: number | null;
  if (target.unitItem) {
    const invoiceUnit = unitFactor(target.unitItem, line.unit);
    const lineUnit = unitFactor(target.unitItem, target.uom);
    one = invoiceUnit && lineUnit ? invoiceUnit / lineUnit : null;
  } else one = toItemQty({ uom: target.uom, packUnit: null, packSize: null, units: [] }, 1, line.unit);
  if (one === null || one <= 0) {
    return { qty: line.qty, rate: line.rate, note: `Invoice is in ${line.unit.toUpperCase()}, this line in ${target.uom}: check the quantity`, unitProblem: true };
  }
  const qty = line.qty === null ? null : Math.round(line.qty * one * 1000) / 1000;
  const rate = line.rate === null ? null : Math.round((line.rate / one) * 100) / 100;
  return { qty, rate, note: line.qty === null ? null : `${fmt(line.qty)} ${unitKey(line.unit)} = ${fmt(qty!)} ${target.uom}`, unitProblem: false };
}

function score(line: InvoiceLine, target: MatchTarget) {
  const text = textScore(`${line.description} ${line.hsn ?? ""}`, target);
  const c = convert(line, target);
  let rate = 0;
  if (target.rate && c.rate) {
    const off = Math.abs(c.rate - target.rate) / target.rate;
    rate = off <= 0.005 ? 1 : off <= 0.05 ? 0.6 : off <= 0.2 ? 0.2 : 0;
  }
  let qty = 0;
  if (target.qty && c.qty) {
    const off = Math.abs(c.qty - target.qty) / target.qty;
    qty = off <= 0.01 ? 1 : off <= 0.1 ? 0.5 : c.qty <= target.qty ? 0.3 : 0;
  }
  return 0.5 * text + 0.3 * rate + 0.2 * qty;
}

/** Best one-to-one pairing of invoice lines with PO lines (each pairing needs a score of 0.3, unless there is just one of each). */
export function matchLines(lines: InvoiceLine[], targets: MatchTarget[]): LineMatch[] {
  const out: LineMatch[] = lines.map(() => ({ target: null, score: 0 }));
  if (lines.length === 1 && targets.length === 1) return [{ target: targets[0].key, score: score(lines[0], targets[0]) }];
  const pairs = lines.flatMap((l, i) => targets.map((t) => ({ i, key: t.key, s: score(l, t) }))).sort((a, b) => b.s - a.s);
  const used = new Set<number>();
  for (const p of pairs) {
    if (p.s < 0.3 || out[p.i].target !== null || used.has(p.key)) continue;
    out[p.i] = { target: p.key, score: p.s };
    used.add(p.key);
  }
  return out;
}
