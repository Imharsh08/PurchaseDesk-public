import "server-only";

import type { IndentStatus, POStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { loadUnitItems } from "@/lib/item-units";
import { isStale, stockPosition, type StockPosition } from "@/lib/stock";
import { toItemQty } from "@/lib/units";

/** Indents still heading towards a PO (their quantities are "on order"). */
const OPEN_INDENT: IndentStatus[] = ["OPEN", "PENDING_APPROVAL", "APPROVED"];
/** POs issued or being issued but not yet received. */
const OPEN_PO: POStatus[] = ["PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"];

export type StockRow = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  uom: string;
  packUnit: string | null;
  packSize: number | null;
  minStock: number | null;
  reorderQty: number | null;
  current: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  stale: boolean;
  onOrder: number;
  position: StockPosition;
};

/**
 * Quantity per item already requested (open indents) or ordered (open POs, less received), in the
 * item's own unit. Lines in another unit are converted; with no conversion set up they count as is.
 */
export async function onOrderByItem() {
  const [indentLines, poLines] = await Promise.all([
    db.indentItem.groupBy({
      by: ["itemId", "uom"],
      where: { indent: { status: { in: OPEN_INDENT } } },
      _sum: { quantity: true },
    }),
    db.poItem.groupBy({
      by: ["itemId", "uom"],
      where: {
        po: {
          OR: [{ status: { in: OPEN_PO } }, { status: "DRAFT", quotationId: { not: null } }],
        },
      },
      _sum: { quantity: true, quantityReceived: true },
    }),
  ]);
  const units = await loadUnitItems(
    [...indentLines, ...poLines].filter((r) => r.uom && r.uom.trim()).map((r) => r.itemId),
  );
  const inItemUnit = (itemId: number, qty: number, uom: string) => {
    const item = units.get(itemId);
    return item ? (toItemQty(item, qty, uom) ?? qty) : qty;
  };
  const map = new Map<number, number>();
  for (const r of indentLines) map.set(r.itemId, (map.get(r.itemId) ?? 0) + inItemUnit(r.itemId, toNumber(r._sum.quantity), r.uom));
  for (const r of poLines) {
    const open = Math.max(0, toNumber(r._sum.quantity) - toNumber(r._sum.quantityReceived));
    map.set(r.itemId, (map.get(r.itemId) ?? 0) + inItemUnit(r.itemId, open, r.uom));
  }
  return map;
}

export async function loadStockRows(): Promise<StockRow[]> {
  const [items, onOrder] = await Promise.all([
    db.item.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        uom: true,
        packUnit: true,
        packSize: true,
        minStock: true,
        reorderQty: true,
        currentStock: true,
        stockUpdatedAt: true,
        stockUpdatedBy: { select: { name: true } },
      },
    }),
    onOrderByItem(),
  ]);

  const now = new Date();
  return items.map((i) => {
    const row = {
      id: i.id,
      sku: i.sku,
      name: i.name,
      category: i.category,
      uom: i.uom,
      packUnit: i.packUnit,
      packSize: i.packSize === null ? null : toNumber(i.packSize),
      minStock: i.minStock === null ? null : toNumber(i.minStock),
      reorderQty: i.reorderQty === null ? null : toNumber(i.reorderQty),
      current: i.currentStock === null ? null : toNumber(i.currentStock),
      updatedAt: i.stockUpdatedAt,
      updatedBy: i.stockUpdatedBy?.name ?? null,
      stale: isStale(i.stockUpdatedAt, now),
      onOrder: onOrder.get(i.id) ?? 0,
    };
    return { ...row, position: stockPosition({ ...row }) };
  });
}

/** Sidebar badge counts in one round trip (the layout renders on every navigation and action). */
export async function sidebarCounts() {
  const [r] = await db.$queryRaw<
    { pending_pos: bigint; open_indents: bigint; pending_comparisons: bigint; below_min: bigint; pending_qc: bigint; bills_to_pass: bigint; pending_amendments: bigint }[]
  >`
    SELECT
      (SELECT count(*) FROM purchase_orders WHERE status = 'PENDING_APPROVAL') AS pending_pos,
      (SELECT count(*) FROM indents WHERE status = 'OPEN') AS open_indents,
      (SELECT count(*) FROM indents WHERE status = 'PENDING_APPROVAL') AS pending_comparisons,
      (SELECT count(*) FROM items
        WHERE active AND min_stock IS NOT NULL AND current_stock IS NOT NULL AND current_stock < min_stock) AS below_min,
      (SELECT count(*) FROM goods_receipts WHERE status = 'PENDING_QC') AS pending_qc,
      (SELECT count(*) FROM bills WHERE status = 'ENTERED') AS bills_to_pass,
      (SELECT count(*) FROM po_amendments WHERE status = 'PENDING') AS pending_amendments`;
  return {
    pendingPOs: Number(r.pending_pos),
    openIndents: Number(r.open_indents),
    pendingComparisons: Number(r.pending_comparisons),
    belowMin: Number(r.below_min),
    pendingQc: Number(r.pending_qc),
    billsToPass: Number(r.bills_to_pass),
    pendingAmendments: Number(r.pending_amendments),
  };
}

/** Active items whose last counted stock is below their minimum (for badges and alerts). */
export async function countItemsBelowMinimum() {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM items
    WHERE active AND min_stock IS NOT NULL AND current_stock IS NOT NULL AND current_stock < min_stock`;
  return Number(rows[0]?.n ?? 0);
}
