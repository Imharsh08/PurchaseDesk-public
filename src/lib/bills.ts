import "server-only";

export { BILL_STATUS, PAYMENT_STATUS } from "@/lib/bill-labels";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dateFormatter, formatDate, toNumber } from "@/lib/format";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";
import { netRate } from "@/lib/quote-scoring";

type Tx = Prisma.TransactionClient;

async function nextNumber(tx: Tx, key: string, prefix: string, date = new Date()) {
  const counter = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  const year = dateFormatter("en-CA", { year: "numeric" }).format(date);
  return `${prefix}-${year}-${String(counter.value).padStart(4, "0")}`;
}

export const nextBillNumber = (tx: Tx) => nextNumber(tx, "BILL:SEQ", "BILL");
export const nextDebitNoteNumber = (tx: Tx) => nextNumber(tx, "DN:SEQ", "DN");

/** Micro & small enterprises get the 45-day protection; medium ones don't. */
export function isProtectedMsme(vendor: { msme: boolean; msmeCategory: string | null }) {
  return vendor.msme && vendor.msmeCategory !== "MEDIUM";
}

/** A checked goods receipt with everything needed to match its bill. */
export async function loadBillContext(grnId: number) {
  const grn = await db.goodsReceipt.findUnique({
    where: { id: grnId },
    include: {
      vendor: { select: { id: true, name: true, msme: true, msmeCategory: true, msmeNumber: true, creditDays: true, gstin: true } },
      po: { select: { id: true, poNumber: true, creditDays: true, paymentTerms: true } },
      bill: { select: { id: true } },
      items: {
        orderBy: { poItem: { lineNo: "asc" } },
        include: {
          item: { select: { sku: true, ...unitItemSelect } },
          poItem: { select: { description: true, uom: true, rate: true, discountPct: true, gstRate: true } },
        },
      },
    },
  });
  if (!grn) return null;
  const lines = grn.items.map((l) => ({
    grnItemId: l.id,
    description: l.poItem.description,
    sku: l.item.sku,
    /** The item's own unit, pack and conversions (to convert an invoice's unit to this line's). */
    unitItem: toUnitItem(l.item),
    uom: l.poItem.uom,
    receivedQty: toNumber(l.receivedQty),
    invoiceQty: l.invoiceQty === null ? null : toNumber(l.invoiceQty),
    acceptedQty: toNumber(l.acceptedQty),
    poRate: netRate(toNumber(l.poItem.rate), toNumber(l.poItem.discountPct)),
    gstRate: toNumber(l.poItem.gstRate),
  }));
  const creditDays = grn.po.creditDays ?? grn.vendor.creditDays ?? 0;
  return { grn, lines, creditDays, msme: isProtectedMsme(grn.vendor) };
}

/** Invoice copies attached to a goods receipt, for the bill screens. */
export async function invoiceFilesFor(of: number | { billId: number }) {
  const docs = await db.document.findMany({
    where: { ...(typeof of === "number" ? { grnId: of } : { grn: { bill: { id: of.billId } } }), type: "INVOICE", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, size: true, createdAt: true },
  });
  return docs.map((d) => ({ id: d.id, fileName: d.fileName, size: d.size, addedOn: formatDate(d.createdAt) }));
}
