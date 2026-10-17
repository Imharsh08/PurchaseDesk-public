import { describe, expect, it } from "vitest";
import { billDueDate, matchBill, matchLine } from "./bill-calc";

describe("matchLine", () => {
  it("no debit when billed exactly as accepted at PO rate", () => {
    const l = matchLine({ acceptedQty: 100, poRate: 50, gstRate: 18, billedQty: 100, billedRate: 50 });
    expect(l.debit).toBe(0);
    expect(l.qtyDiff).toBe(0);
  });

  it("debits qty billed above accepted, with GST", () => {
    // billed 100, accepted 95 → 5 × 50 = 250 + 18% = 295
    const l = matchLine({ acceptedQty: 95, poRate: 50, gstRate: 18, billedQty: 100, billedRate: 50 });
    expect(l.qtyDiff).toBe(5);
    expect(l.debit).toBe(295);
  });

  it("debits rate above PO rate", () => {
    // 100 × (52 − 50) = 200 + 18% = 236
    const l = matchLine({ acceptedQty: 100, poRate: 50, gstRate: 18, billedQty: 100, billedRate: 52 });
    expect(l.rateDiff).toBe(2);
    expect(l.debit).toBe(236);
  });

  it("combines excess qty and excess rate without double counting", () => {
    // billed 100 × 52 = 5200; allowed 95 × 50 = 4750; excess 450 + 5% = 472.5
    const l = matchLine({ acceptedQty: 95, poRate: 50, gstRate: 5, billedQty: 100, billedRate: 52 });
    expect(l.debit).toBe(472.5);
  });

  it("no debit when billed less than accepted or below PO rate", () => {
    expect(matchLine({ acceptedQty: 100, poRate: 50, gstRate: 18, billedQty: 90, billedRate: 48 }).debit).toBe(0);
  });
});

describe("matchBill", () => {
  it("totals debit and payable", () => {
    const m = matchBill({
      lines: [
        { acceptedQty: 95, poRate: 50, gstRate: 18, billedQty: 100, billedRate: 50 },
        { acceptedQty: 10, poRate: 100, gstRate: 18, billedQty: 10, billedRate: 100 },
      ],
      otherCharges: 500,
      otherDebit: 100,
      totalAmount: 7580,
    });
    // billed: (5000 + 1000) × 1.18 + 500 = 7580
    expect(m.billedComputed).toBe(7580);
    expect(m.totalVariance).toBe(0);
    expect(m.debitAmount).toBe(395);
    expect(m.payableAmount).toBe(7185);
    expect(m.qtyMismatch).toBe(true);
    expect(m.rateMismatch).toBe(false);
  });
});

describe("billDueDate", () => {
  const invoice = new Date("2026-10-01T00:00:00Z");
  const accepted = new Date("2026-10-05T10:00:00Z");

  it("non-MSME: invoice date + credit days", () => {
    expect(billDueDate({ invoiceDate: invoice, acceptedAt: accepted, creditDays: 30, msme: false }).dueDate.toISOString().slice(0, 10)).toBe("2026-10-31");
  });

  it("MSME: capped at 45 days from acceptance", () => {
    const r = billDueDate({ invoiceDate: invoice, acceptedAt: accepted, creditDays: 60, msme: true });
    expect(r.days).toBe(45);
    expect(r.dueDate.toISOString().slice(0, 10)).toBe("2026-11-19");
  });

  it("MSME without agreed credit: 15 days", () => {
    expect(billDueDate({ invoiceDate: invoice, acceptedAt: accepted, creditDays: 0, msme: true }).days).toBe(15);
  });
});
