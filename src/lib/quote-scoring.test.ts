import { describe, expect, it } from "vitest";
import {
  NORMAL_WEIGHTS,
  URGENT_WEIGHTS,
  deliveryScore,
  locationOf,
  paymentScore,
  qualityScore,
  scoreLine,
  type QuoteFactors,
} from "./quote-scoring";

const base: Omit<QuoteFactors, "quotationId"> = {
  deliveryDays: 5,
  location: "SAME_CITY",
  certification: "NONE",
  creditDays: 0,
  earlyDiscountPct: 0,
};

describe("factor scores match QUOTATION_SCORING.md examples", () => {
  it("delivery: 5 days vs best 4, same city, 95% on time = 89", () => {
    expect(deliveryScore({ ...base, quotationId: 1, onTimePct: 95 }, 4)).toBeCloseTo(89, 5);
  });
  it("quality: ISO 9001 with 1.5% defects = 95; no cert with 3% = 67", () => {
    expect(qualityScore({ ...base, quotationId: 1, certification: "ISO_9001", defectRatePct: 1.5 })).toBeCloseTo(95, 5);
    expect(qualityScore({ ...base, quotationId: 1, certification: "NONE", defectRatePct: 3 })).toBeCloseTo(67, 5);
  });
  it("payment: 30 days + 2% discount = 81.5; 45 days + 0% = 85", () => {
    expect(paymentScore({ ...base, quotationId: 1, creditDays: 30, earlyDiscountPct: 2 })).toBeCloseTo(81.5, 5);
    expect(paymentScore({ ...base, quotationId: 1, creditDays: 45, earlyDiscountPct: 0 })).toBeCloseTo(85, 5);
  });
});

describe("scoreLine", () => {
  const factors = new Map<number, QuoteFactors>([
    [1, { ...base, quotationId: 1, deliveryDays: 5, certification: "ISO_9001", creditDays: 30 }],
    [2, { ...base, quotationId: 2, deliveryDays: 15, location: "OTHER_STATE", creditDays: 0 }],
    [3, { ...base, quotationId: 3, deliveryDays: 3, location: "SAME_STATE", creditDays: 45 }],
  ]);
  const offers = [
    { quotationId: 1, netRate: 100 },
    { quotationId: 2, netRate: 95 },
    { quotationId: 3, netRate: 104 },
  ];

  it("marks the cheapest offer as L1 and gives it a price score of 100", () => {
    const scored = scoreLine(offers, factors, NORMAL_WEIGHTS);
    const l1 = scored.filter((s) => s.isL1);
    expect(l1.map((s) => s.quotationId)).toEqual([2]);
    expect(l1[0].price).toBe(100);
  });

  it("recommends exactly one offer, which need not be L1", () => {
    const scored = scoreLine(offers, factors, NORMAL_WEIGHTS);
    expect(scored.filter((s) => s.recommended)).toHaveLength(1);
    // Vendor 2 is cheapest but slow, uncertified and advance-payment: not recommended.
    expect(scored.find((s) => s.recommended)!.quotationId).not.toBe(2);
  });

  it("urgent weights favour the fastest delivery", () => {
    const scored = scoreLine(offers, factors, URGENT_WEIGHTS);
    expect(scored.find((s) => s.recommended)!.quotationId).toBe(3);
  });

  it("ignores offers without a rate or without factors", () => {
    expect(scoreLine([{ quotationId: 9, netRate: 50 }, { quotationId: 1, netRate: 0 }], factors, NORMAL_WEIGHTS)).toEqual([]);
  });
});

describe("locationOf", () => {
  const buyer = { city: "Meerut", stateCode: "09" };
  it("detects same city, same state, other state and unknown", () => {
    expect(locationOf(buyer, { city: "meerut ", stateCode: "09" })).toBe("SAME_CITY");
    expect(locationOf(buyer, { city: "Noida", stateCode: "09" })).toBe("SAME_STATE");
    expect(locationOf(buyer, { city: "Mumbai", gstin: "27AAAAA0000A1Z5" })).toBe("OTHER_STATE");
    expect(locationOf(buyer, { city: "X" })).toBe("UNKNOWN");
  });
});
