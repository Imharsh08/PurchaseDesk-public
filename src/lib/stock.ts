/**
 * Stock position rules (pure; shared by the dashboard, stock update screen and indent pre-fill).
 * All quantities are in the item's base unit (uom), e.g. Kg or Ltr.
 */

export type StockStatus = "NOT_COUNTED" | "NO_MINIMUM" | "OUT" | "BELOW_MIN" | "NEAR_MIN" | "OK";

/** "Near minimum" = within 20% above the minimum stock. */
export const NEAR_MIN_FACTOR = 1.2;
/** A count older than this is flagged as stale on the dashboard. */
export const STALE_DAYS = 7;

export const STOCK_STATUS: Record<StockStatus, { label: string; tone: string; rank: number }> = {
  OUT: { label: "Out of stock", tone: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300", rank: 0 },
  BELOW_MIN: { label: "Below minimum", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", rank: 1 },
  NEAR_MIN: { label: "Near minimum", tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", rank: 2 },
  OK: { label: "OK", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", rank: 3 },
  NOT_COUNTED: { label: "Not counted", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", rank: 4 },
  NO_MINIMUM: { label: "No minimum set", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", rank: 5 },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Rounds a quantity up to whole packs (1 Bale = 25 Kg → 180 Kg becomes 200 Kg). */
export function roundUpToPacks(qty: number, packSize: number | null) {
  if (!packSize || packSize <= 0 || qty <= 0) return round3(Math.max(qty, 0));
  return round3(Math.ceil(round3(qty / packSize)) * packSize);
}

export type StockInput = {
  current: number | null;
  minStock: number | null;
  reorderQty: number | null;
  packSize: number | null;
  /** Already requested or ordered: open indents + open POs not yet received. */
  onOrder: number;
};

export type StockPosition = {
  status: StockStatus;
  /** How far below minimum after counting what's on order (0 if covered). */
  shortfall: number;
  /** Suggested order: at least the re-order qty, rounded up to whole packs. 0 = nothing to order. */
  suggested: number;
  /** current ÷ minimum, for sorting most-critical first (Infinity when there's no minimum). */
  ratio: number;
  /** Below minimum, but open indents/POs already cover the gap. */
  coveredByOrders: boolean;
};

export function stockPosition({ current, minStock, reorderQty, packSize, onOrder }: StockInput): StockPosition {
  if (current === null) {
    return { status: "NOT_COUNTED", shortfall: 0, suggested: 0, ratio: Number.POSITIVE_INFINITY, coveredByOrders: false };
  }
  if (minStock === null || minStock <= 0) {
    return {
      status: current <= 0 ? "OUT" : "NO_MINIMUM",
      shortfall: 0,
      suggested: 0,
      ratio: Number.POSITIVE_INFINITY,
      coveredByOrders: false,
    };
  }

  const status: StockStatus =
    current <= 0 ? "OUT" : current < minStock ? "BELOW_MIN" : current < minStock * NEAR_MIN_FACTOR ? "NEAR_MIN" : "OK";
  const gap = round3(minStock - current);
  const shortfall = round3(Math.max(0, gap - onOrder));
  const suggested = shortfall > 0 ? roundUpToPacks(Math.max(shortfall, reorderQty ?? 0), packSize) : 0;

  return {
    status,
    shortfall,
    suggested,
    ratio: current / minStock,
    coveredByOrders: gap > 0 && shortfall === 0,
  };
}

/** Splits a quantity into whole packs + loose: 305 Kg with 1 Bale = 25 Kg → { packs: 12, loose: 5 }. */
export function toPacks(qty: number, packSize: number | null) {
  if (!packSize || packSize <= 0) return null;
  const packs = Math.floor(round3(qty / packSize));
  return { packs, loose: round3(qty - packs * packSize) };
}

/** "12 Bale + 5 Kg", "12 Bale" or "305 Kg" (quantity formatter injected to keep this module Intl-free). */
export function describePacks(
  qty: number,
  item: { uom: string; packUnit: string | null; packSize: number | null },
  fmt: (n: number) => string = (n) => String(n),
) {
  const split = item.packUnit ? toPacks(qty, item.packSize) : null;
  if (!split || split.packs === 0) return `${fmt(qty)} ${item.uom}`;
  return split.loose ? `${fmt(split.packs)} ${item.packUnit} + ${fmt(split.loose)} ${item.uom}` : `${fmt(split.packs)} ${item.packUnit}`;
}

/** Stock entered as packs + loose quantity → base unit. */
export function fromPacks(packs: number, loose: number, packSize: number | null) {
  return round3((packSize && packSize > 0 ? packs * packSize : 0) + loose);
}

export function isStale(updatedAt: Date | string | null, now = new Date()) {
  if (!updatedAt) return true;
  return now.getTime() - new Date(updatedAt).getTime() > STALE_DAYS * 86_400_000;
}
