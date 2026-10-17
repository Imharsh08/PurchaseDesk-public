/**
 * Quotation scoring, per QUOTATION_SCORING.md:
 *   total = price × 40% + delivery × 30% + quality × 20% + payment terms × 10%   (normal)
 *   Urgent indents use the "emergency order" weights: 20 / 60 / 10 / 10.
 * Each factor is 0–100. Scores are computed per indent line, because vendors can be
 * chosen item by item.
 *
 * On-time % and defect (rejection) rate come from the vendor's goods receipts; vendors with no
 * receipts yet get neutral values (NEUTRAL_*) and the UI says so.
 */

export type Weights = { price: number; delivery: number; quality: number; payment: number };

export const NORMAL_WEIGHTS: Weights = { price: 0.4, delivery: 0.3, quality: 0.2, payment: 0.1 };
export const URGENT_WEIGHTS: Weights = { price: 0.2, delivery: 0.6, quality: 0.1, payment: 0.1 };

/** Stand-ins until on-time % and defect rates can be computed from goods receipts. */
export const NEUTRAL_ON_TIME_PCT = 80;
export const NEUTRAL_DEFECT_SCORE = 85;

export type Certification = "ISO_9001" | "ISO_OTHER" | "CUSTOMER" | "NONE";

export const CERTIFICATION_LABELS: Record<Certification, string> = {
  ISO_9001: "ISO 9001",
  ISO_OTHER: "ISO 14001 / 45001",
  CUSTOMER: "Customer certified",
  NONE: "None",
};

export type QuoteFactors = {
  quotationId: number;
  deliveryDays: number | null;
  /** Vendor location relative to the buyer (distance proxy). */
  location: "SAME_CITY" | "SAME_STATE" | "OTHER_STATE" | "UNKNOWN";
  certification: Certification;
  creditDays: number;
  earlyDiscountPct: number;
  onTimePct?: number | null;
  defectRatePct?: number | null;
};

export type Offer = { quotationId: number; netRate: number };

export type ScoredOffer = Offer & {
  price: number;
  delivery: number;
  quality: number;
  payment: number;
  total: number;
  isL1: boolean;
  recommended: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function locationOf(
  buyer: { city?: string | null; stateCode?: string | null },
  vendor: { city?: string | null; stateCode?: string | null; gstin?: string | null },
): QuoteFactors["location"] {
  const vendorState = vendor.stateCode || vendor.gstin?.slice(0, 2) || null;
  if (!buyer.stateCode || !vendorState) return "UNKNOWN";
  if (buyer.stateCode !== vendorState) return "OTHER_STATE";
  const same = buyer.city && vendor.city && buyer.city.trim().toLowerCase() === vendor.city.trim().toLowerCase();
  return same ? "SAME_CITY" : "SAME_STATE";
}

const LOCATION_SCORE: Record<QuoteFactors["location"], number> = {
  SAME_CITY: 100,
  SAME_STATE: 85, // "adjacent" in the doc; no distance data yet
  OTHER_STATE: 70,
  UNKNOWN: 70,
};

export function deliveryScore(f: QuoteFactors, minDays: number | null) {
  const days =
    f.deliveryDays === null || minDays === null ? 50 : (Math.max(minDays, 1) / Math.max(f.deliveryDays, 1)) * 100;
  const history = f.onTimePct ?? NEUTRAL_ON_TIME_PCT;
  return days * 0.5 + LOCATION_SCORE[f.location] * 0.3 + history * 0.2;
}

const CERT_SCORE: Record<Certification, number> = { ISO_9001: 95, ISO_OTHER: 85, CUSTOMER: 80, NONE: 40 };

export function defectScore(defectRatePct: number | null | undefined) {
  if (defectRatePct === null || defectRatePct === undefined) return NEUTRAL_DEFECT_SCORE;
  if (defectRatePct <= 2) return 95;
  if (defectRatePct <= 5) return 85;
  if (defectRatePct <= 10) return 70;
  return 40;
}

export function qualityScore(f: QuoteFactors) {
  return CERT_SCORE[f.certification] * 0.4 + defectScore(f.defectRatePct) * 0.6;
}

export function creditDaysScore(days: number) {
  if (days <= 0) return 40;
  if (days < 30) return 60;
  if (days < 45) return 80;
  return 100;
}

// Follows the table in QUOTATION_SCORING.md (0% 50, 1-2% 70, 2-5% 85, >5% 100), with exactly 2%
// scored 85 as in its Vendor A example. (Its Vendor C example scores 3% as 100, which contradicts the table.)
export function earlyDiscountScore(pct: number) {
  if (pct <= 0) return 50;
  if (pct < 2) return 70;
  if (pct <= 5) return 85;
  return 100;
}

export function paymentScore(f: QuoteFactors) {
  return creditDaysScore(f.creditDays) * 0.7 + earlyDiscountScore(f.earlyDiscountPct) * 0.3;
}

/**
 * Scores every vendor offer for one indent line. The recommendation is the highest total;
 * ties go to the lower price.
 */
export function scoreLine(offers: Offer[], factors: Map<number, QuoteFactors>, weights: Weights): ScoredOffer[] {
  const valid = offers.filter((o) => o.netRate > 0 && factors.has(o.quotationId));
  if (!valid.length) return [];
  const minRate = Math.min(...valid.map((o) => o.netRate));
  const days = valid.map((o) => factors.get(o.quotationId)!.deliveryDays).filter((d): d is number => d !== null);
  const minDays = days.length ? Math.min(...days) : null;

  const scored = valid.map((o) => {
    const f = factors.get(o.quotationId)!;
    const price = (minRate / o.netRate) * 100;
    const delivery = deliveryScore(f, minDays);
    const quality = qualityScore(f);
    const payment = paymentScore(f);
    const total =
      price * weights.price + delivery * weights.delivery + quality * weights.quality + payment * weights.payment;
    return {
      ...o,
      price: r1(price),
      delivery: r1(delivery),
      quality: r1(quality),
      payment: r1(payment),
      total: r1(total),
      isL1: o.netRate === minRate,
      recommended: false,
    };
  });

  const best = [...scored].sort((a, b) => b.total - a.total || a.netRate - b.netRate)[0];
  best.recommended = true;
  return scored;
}

export function netRate(rate: number, discountPct: number) {
  return Math.round(rate * (1 - discountPct / 100) * 100) / 100;
}
