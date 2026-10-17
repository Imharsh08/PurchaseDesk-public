import { describe, expect, it } from "vitest";
import { calcLine, calcTotals, determineTaxMode, round2 } from "./po-calc";

describe("calcLine", () => {
  it("applies discount before tax", () => {
    const a = calcLine({ quantity: 10, rate: 100, discountPct: 10, gstRate: 18 }, "INTER_STATE");
    expect(a).toEqual({ gross: 1000, discount: 100, taxable: 900, tax: 162, total: 1062 });
  });

  it("handles fractional quantities (kg) and rupee rates", () => {
    const a = calcLine({ quantity: 12.345, rate: 118.75, discountPct: 0, gstRate: 5 }, "INTER_STATE");
    expect(a.taxable).toBe(1465.97);
    expect(a.tax).toBe(73.3);
  });

  it("keeps intra-state tax an even split so CGST equals SGST", () => {
    // 17,812.50 × 9% = 1,603.125 → each half rounds to 1,603.13
    const a = calcLine({ quantity: 150, rate: 118.75, discountPct: 0, gstRate: 18 }, "INTRA_STATE");
    expect(a.tax).toBe(3206.26);
  });
});

describe("calcTotals", () => {
  const lines = [
    { quantity: 1200, rate: 265, discountPct: 0, gstRate: 18 },
    { quantity: 150, rate: 118.75, discountPct: 0, gstRate: 18 },
    { quantity: 100, rate: 50, discountPct: 0, gstRate: 5 },
  ];

  it("splits intra-state tax into equal CGST and SGST per slab", () => {
    const t = calcTotals(lines, "INTRA_STATE");
    expect(t.cgst).toBe(t.sgst);
    expect(t.igst).toBe(0);
    expect(t.slabs.map((s) => s.gstRate)).toEqual([5, 18]);
    for (const s of t.slabs) expect(s.cgst).toBe(s.sgst);
  });

  it("uses IGST for inter-state", () => {
    const t = calcTotals(lines, "INTER_STATE");
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.igst).toBe(round2(0.18 * (318000 + 17812.5) + 0.05 * 5000));
  });

  it("rounds the grand total to whole rupees and records the round-off", () => {
    const t = calcTotals(lines, "INTRA_STATE");
    expect(Number.isInteger(t.grandTotal)).toBe(true);
    expect(round2(t.subtotal + t.cgst + t.sgst + t.roundOff)).toBe(t.grandTotal);
    expect(Math.abs(t.roundOff)).toBeLessThanOrEqual(0.5);
  });

  it("returns zeros for no lines", () => {
    expect(calcTotals([], "INTRA_STATE")).toMatchObject({ subtotal: 0, grandTotal: 0, roundOff: 0, slabs: [] });
  });
});

describe("determineTaxMode", () => {
  it("is intra-state when states match", () => {
    expect(determineTaxMode("06", { stateCode: "06" })).toBe("INTRA_STATE");
  });
  it("is inter-state when states differ", () => {
    expect(determineTaxMode("06", { stateCode: "24" })).toBe("INTER_STATE");
  });
  it("falls back to the GSTIN state prefix", () => {
    expect(determineTaxMode("06", { gstin: "07AAACD4321M1Z9" })).toBe("INTER_STATE");
  });
  it("assumes intra-state when either state is unknown", () => {
    expect(determineTaxMode(null, { stateCode: "24" })).toBe("INTRA_STATE");
    expect(determineTaxMode("06", {})).toBe("INTRA_STATE");
  });
});
