import { describe, expect, it } from "vitest";
import { describePacks, fromPacks, isStale, roundUpToPacks, stockPosition, toPacks } from "./stock";

const base = { minStock: 500, reorderQty: 250, packSize: 25, onOrder: 0 };

describe("stockPosition", () => {
  it("flags out of stock and suggests the full shortfall in packs", () => {
    const p = stockPosition({ ...base, current: 0 });
    expect(p.status).toBe("OUT");
    expect(p.shortfall).toBe(500);
    expect(p.suggested).toBe(500);
  });

  it("orders at least the re-order qty, rounded up to whole packs", () => {
    // short by 180 Kg; re-order qty 250 Kg → 250 Kg (10 bales)
    expect(stockPosition({ ...base, current: 320 }).suggested).toBe(250);
    // short by 310 Kg (> re-order qty) → 325 Kg (13 bales)
    expect(stockPosition({ ...base, current: 190 }).suggested).toBe(325);
  });

  it("subtracts what is already on order", () => {
    const p = stockPosition({ ...base, current: 320, onOrder: 100 });
    expect(p.shortfall).toBe(80);
    expect(p.suggested).toBe(250);
  });

  it("marks shortages covered by open indents/POs", () => {
    const p = stockPosition({ ...base, current: 320, onOrder: 200 });
    expect(p.status).toBe("BELOW_MIN");
    expect(p.coveredByOrders).toBe(true);
    expect(p.suggested).toBe(0);
  });

  it("near minimum is within 20% above minimum; no order needed", () => {
    expect(stockPosition({ ...base, current: 550 })).toMatchObject({ status: "NEAR_MIN", suggested: 0 });
    expect(stockPosition({ ...base, current: 600 }).status).toBe("OK");
  });

  it("handles items without a count or a minimum", () => {
    expect(stockPosition({ ...base, current: null }).status).toBe("NOT_COUNTED");
    expect(stockPosition({ ...base, minStock: null, current: 40 })).toMatchObject({ status: "NO_MINIMUM", suggested: 0 });
  });

  it("works without packs", () => {
    expect(stockPosition({ ...base, packSize: null, reorderQty: null, current: 480.5 }).suggested).toBe(19.5);
  });

  it("sorts most critical first by stock ÷ minimum", () => {
    expect(stockPosition({ ...base, current: 100 }).ratio).toBeLessThan(stockPosition({ ...base, current: 400 }).ratio);
  });
});

describe("packs", () => {
  const bale = { uom: "Kg", packUnit: "Bale", packSize: 25 };
  it("splits and describes quantities", () => {
    expect(toPacks(305, 25)).toEqual({ packs: 12, loose: 5 });
    expect(describePacks(305, bale)).toBe("12 Bale + 5 Kg");
    expect(describePacks(300, bale)).toBe("12 Bale");
    expect(describePacks(20, bale)).toBe("20 Kg");
    expect(describePacks(400, { uom: "Ltr", packUnit: "Drum", packSize: 200 })).toBe("2 Drum");
    expect(describePacks(12, { uom: "Kg", packUnit: null, packSize: null })).toBe("12 Kg");
  });
  it("converts pack entry back to base units", () => {
    expect(fromPacks(12, 5, 25)).toBe(305);
    expect(fromPacks(0, 7.5, 25)).toBe(7.5);
    expect(fromPacks(3, 0, null)).toBe(0);
  });
  it("rounds up without floating-point surprises", () => {
    expect(roundUpToPacks(0.3, 0.1)).toBeCloseTo(0.3, 5);
    expect(roundUpToPacks(200, 25)).toBe(200);
  });
});

describe("isStale", () => {
  it("is stale after 7 days or when never counted", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date("2026-09-25T12:00:00Z"), now)).toBe(false);
    expect(isStale(new Date("2026-09-22T12:00:00Z"), now)).toBe(true);
  });
});
