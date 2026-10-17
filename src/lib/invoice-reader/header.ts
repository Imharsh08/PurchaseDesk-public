/**
 * Header fields of an invoice (number, date, order no., vehicle …): find the label on a line, then
 * the value to its right ("Invoice No. : 123") or in the box under it (Tally's boxed headers),
 * up to four lines below and within the label's column. A field is only filled when a label and a
 * valid value are both found; what was matched is kept, to show next to the value.
 */
import { lineHeight, wordsInSpan, type Line } from "./geometry";
import { findVehicleNo, parseDate } from "./parse";

export type Found<T> = {
  value: T;
  /** The text it was read from, e.g. "Invoice No. → FBD/0922/26-27". */
  from: string;
  page: number;
  /** Index of the label's line. */
  line: number;
};

type Rule<T> = { labels: RegExp[]; read: (text: string) => T | null };

/** A document number: has a digit, isn't a date, a GSTIN or a plain amount; 2–30 characters. */
function docNumber(text: string) {
  for (const token of text.split(/\s{2,}|\s[|:]\s?|\|/)) {
    const t = token
      .trim()
      .replace(/^[:.\-#[\](){}|,;'"`_~—]+|[:.\-#[\](){}|,;'"`_~—]+$/g, "")
      .split(/\s+/)[0];
    if (!t || t.length < 2 || t.length > 30 || !/\d/.test(t)) continue;
    // A whole date ("13-Oct-26", "13/10/2026") is the date column, not the number.
    if (/^\d{1,2}[-./][A-Za-z0-9]{2,9}[-./]\d{2,4}$/.test(t) && parseDate(t)) continue;
    if (/^\d{2}[A-Z]{5}\d{4}/i.test(t)) continue;
    if (/^[\d,]+\.\d{2}$/.test(t)) continue;
    return t;
  }
  return null;
}

const firstDate = (text: string) => parseDate(text);
const twelveDigits = (text: string) => text.replace(/[\s-]/g, "").match(/(?<!\d)\d{12}(?!\d)/)?.[0] ?? null;

export const RULES = {
  invoiceNo: {
    labels: [/(?:in)?v[o0]i[cs]e\s*(?:n[o0o]|number|#)/i, /\binv\.?\s*n[o0]/i, /\bbill\s*n[o0]\b/i, /\bdocument\s*n[o0]/i],
    read: docNumber,
  },
  invoiceDate: {
    labels: [/(?:in)?v[o0]ice\s*date/i, /\binv\.?\s*date/i, /\bbill\s*date/i, /\bdated\b/i, /(?<![a-z])date\b(?!\s*of\s*(supply|removal))/i],
    read: firstDate,
  },
  orderNo: {
    labels: [/buyer'?s?\s*order\s*n[o0]/i, /\bp\.?\s?o\.?\s*(?:n[o0]|number|#)/i, /\border\s*n[o0]/i, /purchase\s*order/i],
    read: docNumber,
  },
  ewayBill: { labels: [/e\s*-?\s*way\s*bill/i], read: twelveDigits },
  vehicleNo: { labels: [/vehicle\s*n[o0]/i, /motor\s*vehicle/i, /(?:truck|lorry)\s*n[o0]/i], read: findVehicleNo },
  challanNo: { labels: [/challan\s*n[o0]/i, /delivery\s*note(?!\s*date)/i], read: docNumber },
  lrNo: { labels: [/\b(?:l\s*\.?\s*r|g\s*\.?\s*r|r\s*\.?\s*r|bilty|bill\s*of\s*lading)[\s/.-]*(?:-?\s*rr)?\s*n[o0]/i], read: docNumber },
} satisfies Record<string, Rule<string>>;

export type HeaderKey = keyof typeof RULES;

/** Labels that start the next box on a line (so a value isn't read across into it). */
const ANY_LABEL = /(?:in)?v[o0]ice|dated?\b|order|e-?\s*way|vehicle|challan|delivery|dispatch|destination|reference|terms|mode|bill\s*of|motor|buyer/i;

export function findField<T>(lines: Line[], rule: Rule<T>): Found<T> | null {
  const h = lineHeight(lines);
  for (const label of rule.labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = label.exec(line.text);
      if (!m) continue;
      const end = (m.index ?? 0) + m[0].length;
      const labelText = m[0];

      // 1. To the right on the same line, up to the next column.
      const rest = line.text.slice(end).replace(/^[\s.:;\-|#)\]]+/, "");
      const right = rest.split(/\s{3,}/)[0];
      if (right && !ANY_LABEL.test(right.slice(0, 12))) {
        const v = rule.read(right);
        if (v !== null) return { value: v, from: `${labelText.trim()} → ${right.trim()}`, page: line.page, line: i };
      }

      // 2. Underneath, within the label's column (until the next label on the label's line).
      const labelWords = wordsInSpan(line, m.index ?? 0, end);
      if (!labelWords.length) continue;
      const x0 = Math.min(...labelWords.map((w) => w.x0));
      const x1 = Math.max(...labelWords.map((w) => w.x1));
      const after = line.words.filter((w) => w.x0 > x1 + h * 0.6);
      const nextColumn = after.length ? Math.min(...after.map((w) => w.x0)) : x1 + Math.max(x1 - x0, h * 8) * 2;
      for (const below of lines.slice(i + 1, i + 6)) {
        if (below.page !== line.page || below.y0 - line.y1 > h * 4.5) break;
        // The value starts near the label and stays in its box (its middle left of the next box).
        const words = below.words.filter((w) => w.x0 >= x0 - h * 1.5 && (w.x0 + w.x1) / 2 < nextColumn - h * 0.3);
        if (!words.length) continue;
        const text = words.map((w) => w.text).join(" ");
        if (ANY_LABEL.test(text) && !/\d/.test(text)) break;
        const v = rule.read(text);
        if (v !== null) return { value: v, from: `${labelText.trim()} ↓ ${text.trim()}`, page: line.page, line: i };
      }
    }
  }
  return null;
}

export function readHeader(lines: Line[]) {
  const out: Partial<Record<HeaderKey, Found<string>>> = {};
  for (const key of Object.keys(RULES) as HeaderKey[]) {
    const f = findField(lines, RULES[key]);
    if (f) out[key] = f;
  }
  // "Dated" appears in several boxes (invoice, buyer's order, delivery note): the invoice's date is
  // the one beside or just below the invoice number's label.
  if (out.invoiceNo) {
    const from = Math.max(0, out.invoiceNo.line - 1);
    const near = findField(lines.slice(from, out.invoiceNo.line + 3), RULES.invoiceDate);
    if (near) out.invoiceDate = { ...near, line: near.line + from };
  }
  // A date labelled in the order / delivery / dispatch boxes is never the invoice date.
  if (out.invoiceDate && /order|delivery|dispatch|despatch|challan|reference|lading/i.test(lines[out.invoiceDate.line]?.text ?? "") && !/invoice/i.test(lines[out.invoiceDate.line]?.text ?? "")) {
    delete out.invoiceDate;
  }
  // No dated label found: the first date near the top of the first page.
  if (!out.invoiceDate) {
    const top = lines.filter((l) => l.page === 0).slice(0, 25);
    for (const l of top) {
      const d = parseDate(l.text);
      if (d) {
        const seen = l.text.match(/\d{1,2}\s*[-./ ]\s*[A-Za-z0-9]{2,9}\s*[-./ ]\s*\d{2,4}/)?.[0] ?? l.text.trim().slice(0, 20);
        out.invoiceDate = { value: d, from: `First date on the invoice: ${seen}`, page: 0, line: lines.indexOf(l) };
        break;
      }
    }
  }
  // The vehicle number is distinctive enough to find without its label.
  if (!out.vehicleNo) {
    for (const l of lines) {
      const v = findVehicleNo(l.text);
      if (v) {
        out.vehicleNo = { value: v, from: l.text.trim().slice(0, 40), page: l.page, line: lines.indexOf(l) };
        break;
      }
    }
  }
  // The same number read as invoice and challan (Tally's "Dispatch Doc No."): not a challan.
  if (out.challanNo && out.invoiceNo && out.challanNo.value === out.invoiceNo.value) delete out.challanNo;
  return out;
}
