/**
 * Three-way match of a vendor bill: invoice (billed qty × rate) against the PO (rate) and the
 * goods receipt (accepted qty). Anything billed above what was accepted, or above the PO rate,
 * becomes a debit (incl. GST). Pure functions, shared by the bill form and the server.
 */

import { round2 } from "@/lib/po-calc";

export type MatchLineInput = {
  acceptedQty: number;
  /** PO rate net of discount */
  poRate: number;
  gstRate: number;
  billedQty: number;
  billedRate: number;
};

export type MatchLine = MatchLineInput & {
  billedTaxable: number;
  expectedTaxable: number;
  qtyDiff: number;
  rateDiff: number;
  /** Excess billed incl. GST */
  debit: number;
};

export function matchLine(l: MatchLineInput): MatchLine {
  const billedTaxable = round2(l.billedQty * l.billedRate);
  const expectedTaxable = round2(l.acceptedQty * l.poRate);
  const allowed = round2(Math.min(l.billedQty, l.acceptedQty) * Math.min(l.billedRate, l.poRate));
  const excess = Math.max(0, round2(billedTaxable - allowed));
  return {
    ...l,
    billedTaxable,
    expectedTaxable,
    qtyDiff: Math.round((l.billedQty - l.acceptedQty) * 1000) / 1000,
    rateDiff: round2(l.billedRate - l.poRate),
    debit: round2(excess * (1 + l.gstRate / 100)),
  };
}

export function matchBill(input: {
  lines: MatchLineInput[];
  otherCharges: number;
  otherDebit: number;
  /** Invoice total as printed on the bill */
  totalAmount: number;
}) {
  const lines = input.lines.map(matchLine);
  const expectedAmount = round2(lines.reduce((s, l) => s + l.expectedTaxable * (1 + l.gstRate / 100), 0) + input.otherCharges);
  const billedComputed = round2(lines.reduce((s, l) => s + l.billedTaxable * (1 + l.gstRate / 100), 0) + input.otherCharges);
  const lineDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const debitAmount = round2(lineDebit + input.otherDebit);
  return {
    lines,
    expectedAmount,
    billedComputed,
    /** Difference between the invoice total and its own lines (arithmetic / rounding on the bill). */
    totalVariance: round2(input.totalAmount - billedComputed),
    lineDebit,
    debitAmount,
    payableAmount: round2(input.totalAmount - debitAmount),
    qtyMismatch: lines.some((l) => l.qtyDiff > 0),
    rateMismatch: lines.some((l) => l.rateDiff > 0),
  };
}

/** MSMED Act sec. 15: micro & small enterprises are paid within the agreed period, at most 45 days from acceptance (15 if none agreed). */
export const MSME_MAX_DAYS = 45;
export const MSME_DEFAULT_DAYS = 15;

export function billDueDate(input: { invoiceDate: Date; acceptedAt: Date | null; creditDays: number; msme: boolean }) {
  const base = input.msme ? (input.acceptedAt ?? input.invoiceDate) : input.invoiceDate;
  const days = input.msme ? (input.creditDays > 0 ? Math.min(input.creditDays, MSME_MAX_DAYS) : MSME_DEFAULT_DAYS) : input.creditDays;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return { dueDate: d, days };
}
