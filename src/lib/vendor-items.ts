import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { RateSource } from "@/generated/prisma/enums";
import { netRate } from "@/lib/quote-scoring";

type Tx = Prisma.TransactionClient;

export type RateEntry = {
  vendorId: number;
  itemId: number;
  /** Rate per item uom before GST. */
  rate: number;
  discountPct?: number;
  source: RateSource;
  date: Date;
};

/**
 * Links a vendor to an item and keeps its current rate up to date: the newest quotation or
 * PO rate wins, so the vendor's item list always shows what they last offered or supplied at.
 */
export async function recordVendorRates(tx: Tx, entries: RateEntry[]) {
  for (const e of entries) {
    const rate = netRate(e.rate, e.discountPct ?? 0);
    const existing = await tx.vendorItem.findUnique({
      where: { vendorId_itemId: { vendorId: e.vendorId, itemId: e.itemId } },
      select: { id: true, rateDate: true },
    });
    if (!existing) {
      await tx.vendorItem.create({
        data: { vendorId: e.vendorId, itemId: e.itemId, rate, rateSource: e.source, rateDate: e.date },
      });
    } else if (!existing.rateDate || e.date.getTime() >= existing.rateDate.getTime()) {
      await tx.vendorItem.update({
        where: { id: existing.id },
        data: { rate, rateSource: e.source, rateDate: e.date, active: true },
      });
    }
  }
}
