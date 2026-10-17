/**
 * Unit conversion for items indented / ordered in a unit other than their own (N550 Carbon kept in
 * Bag but ordered in Kg). Every quantity that is added up or compared — stock, on order, purchased,
 * rates — is first converted to the item's own unit (`uom`).
 *
 * Sources, in order: the item's own unit; its unit conversions (item_units); its standard pack
 * (1 packUnit = packSize uom); and standard measures (Kg / g / Ton, Ltr / ml), also chained with an
 * item conversion (25 Kg = 1 Bag gives 1 Ton = 40 Bag). Client-safe.
 */

export type UnitItem = {
  uom: string;
  packUnit: string | null;
  packSize: number | null;
  /** 1 unit = factor × uom */
  units: { unit: string; factor: number }[];
};

/** Spellings people use for the same unit. */
const ALIASES: Record<string, string> = {
  kgs: "kg",
  kilo: "kg",
  kilogram: "kg",
  kilograms: "kg",
  gm: "g",
  gms: "g",
  gram: "g",
  grams: "g",
  tons: "ton",
  tonne: "ton",
  tonnes: "ton",
  mt: "ton",
  l: "ltr",
  lt: "ltr",
  ltrs: "ltr",
  litre: "ltr",
  litres: "ltr",
  liter: "ltr",
  liters: "ltr",
  mls: "ml",
  nos: "pcs",
  no: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  bags: "bag",
  bales: "bale",
  drums: "drum",
  boxes: "box",
  pkts: "pkt",
  packet: "pkt",
  packets: "pkt",
  mtrs: "mtr",
  meter: "mtr",
  metre: "mtr",
};

/** Canonical key: "KGS " → "kg". */
export function unitKey(unit: string) {
  const k = unit.trim().toLowerCase().replace(/\.$/, "");
  return ALIASES[k] ?? k;
}

export const sameUnit = (a: string, b: string) => unitKey(a) === unitKey(b);

/** Standard measures: size of one unit in the family's base. */
const STANDARD: Record<string, { family: "mass" | "volume"; size: number }> = {
  g: { family: "mass", size: 0.001 },
  kg: { family: "mass", size: 1 },
  quintal: { family: "mass", size: 100 },
  ton: { family: "mass", size: 1000 },
  ml: { family: "volume", size: 0.001 },
  ltr: { family: "volume", size: 1 },
  kl: { family: "volume", size: 1000 },
};

/** The item's known conversions (unit conversions and its pack), keyed by canonical unit. */
function known(item: UnitItem) {
  const map = new Map<string, number>();
  if (item.packUnit && item.packSize && item.packSize > 0 && !sameUnit(item.packUnit, item.uom)) map.set(unitKey(item.packUnit), item.packSize);
  for (const u of item.units) if (u.factor > 0) map.set(unitKey(u.unit), u.factor);
  return map;
}

/** How many of the item's own unit one `unit` is; null when unknown. */
export function unitFactor(item: UnitItem, unit: string): number | null {
  const key = unitKey(unit);
  const base = unitKey(item.uom);
  if (key === base) return 1;
  const map = known(item);
  const direct = map.get(key);
  if (direct !== undefined) return direct;
  const std = STANDARD[key];
  if (!std) return null;
  // Both standard measures of the same kind: Ton → Kg.
  const stdBase = STANDARD[base];
  if (stdBase && stdBase.family === std.family) return std.size / stdBase.size;
  // Through a conversion in the same family: 25 Kg = 1 Bag, so 1 Ton = 1000 Kg = 40 Bag.
  for (const [k, factor] of map) {
    const other = STANDARD[k];
    if (other && other.family === std.family) return (std.size / other.size) * factor;
  }
  return null;
}

/**
 * The units a quantity of this item can be entered in (the unit dropdowns): its own unit, its pack,
 * its unit conversions, and the standard measures that convert to them (Kg ↔ Ton / g, Ltr ↔ ml).
 * Each spelled the way the item has it.
 */
export function unitOptions(item: UnitItem, also: string[] = []) {
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    if (u && !out.some((o) => sameUnit(o, u)) && unitFactor(item, u) !== null) out.push(u);
  };
  add(item.uom);
  for (const u of also) add(u);
  add(item.packUnit);
  for (const u of item.units) add(u.unit);
  for (const u of ["Kg", "Ton", "g", "Ltr", "ml"]) add(u);
  return out;
}

/** A quantity in one unit expressed in another of the same item; null when either can't be converted. */
export function convertQty(item: UnitItem, qty: number, from: string, to: string) {
  if (sameUnit(from, to)) return qty;
  const a = unitFactor(item, from);
  const b = unitFactor(item, to);
  return a === null || b === null || b === 0 ? null : (qty * a) / b;
}

/** A quantity in the item's own unit; null when the unit can't be converted. */
export function toItemQty(item: UnitItem, qty: number, unit: string) {
  const f = unitFactor(item, unit);
  return f === null ? null : qty * f;
}

/** "1 Kg = 0.04 Bag", written the readable way round ("1 Bag = 25 Kg"). */
export function describeFactor(unit: string, factor: number, uom: string, fmt: (n: number) => string = (n) => String(n)) {
  return factor >= 1 ? `1 ${unit} = ${fmt(factor)} ${uom}` : `1 ${uom} = ${fmt(1 / factor)} ${unit}`;
}
