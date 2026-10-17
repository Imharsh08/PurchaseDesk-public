/**
 * Purchase order arithmetic. Shared by the PO form (live totals) and the
 * server (authoritative totals that get stored) so both always agree.
 */

export type TaxMode = "INTRA_STATE" | "INTER_STATE";

export type LineInput = {
  quantity: number;
  rate: number;
  discountPct: number;
  gstRate: number;
};

export type LineAmounts = {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};

export type TaxSlab = { gstRate: number; taxable: number; cgst: number; sgst: number; igst: number };

export type POTotals = {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  slabs: TaxSlab[];
};

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Intra-state: CGST and SGST are each computed at half the rate and rounded,
 * so they are always equal. Inter-state: IGST at the full rate.
 */
export function calcLine({ quantity, rate, discountPct, gstRate }: LineInput, taxMode: TaxMode): LineAmounts {
  const gross = round2(quantity * rate);
  const discount = round2((gross * discountPct) / 100);
  const taxable = round2(gross - discount);
  const tax =
    taxMode === "INTRA_STATE"
      ? round2(2 * round2((taxable * gstRate) / 200))
      : round2((taxable * gstRate) / 100);
  return { gross, discount, taxable, tax, total: round2(taxable + tax) };
}

export function calcTotals(lines: LineInput[], taxMode: TaxMode): POTotals {
  const slabMap = new Map<number, TaxSlab>();
  for (const line of lines) {
    const { taxable, tax } = calcLine(line, taxMode);
    const slab = slabMap.get(line.gstRate) ?? { gstRate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    slab.taxable = round2(slab.taxable + taxable);
    if (taxMode === "INTER_STATE") {
      slab.igst = round2(slab.igst + tax);
    } else {
      slab.cgst = round2(slab.cgst + tax / 2);
      slab.sgst = round2(slab.sgst + tax / 2);
    }
    slabMap.set(line.gstRate, slab);
  }

  const slabs = [...slabMap.values()].sort((a, b) => a.gstRate - b.gstRate);
  const subtotal = round2(slabs.reduce((s, x) => s + x.taxable, 0));
  const cgst = round2(slabs.reduce((s, x) => s + x.cgst, 0));
  const sgst = round2(slabs.reduce((s, x) => s + x.sgst, 0));
  const igst = round2(slabs.reduce((s, x) => s + x.igst, 0));
  const beforeRounding = round2(subtotal + cgst + sgst + igst);
  const grandTotal = Math.round(beforeRounding);

  return {
    subtotal,
    cgst,
    sgst,
    igst,
    roundOff: round2(grandTotal - beforeRounding),
    grandTotal,
    slabs,
  };
}

/**
 * Same state -> CGST + SGST; different states -> IGST.
 * Falls back to the first two digits of the GSTIN when no state code is stored.
 */
export function determineTaxMode(
  buyerStateCode: string | null | undefined,
  vendor: { stateCode?: string | null; gstin?: string | null },
): TaxMode {
  const vendorState = vendor.stateCode || vendor.gstin?.slice(0, 2) || null;
  if (buyerStateCode && vendorState && buyerStateCode !== vendorState) return "INTER_STATE";
  return "INTRA_STATE";
}
