import "server-only";

import { db } from "@/lib/db";
import { toUnitItem } from "@/lib/item-units";
import { formatQty, toNumber } from "@/lib/format";
import { RECEIVABLE_PO } from "@/lib/grn";
import { STOCK_STATUS, stockPosition } from "@/lib/stock";
import { onOrderByItem } from "@/lib/stock-data";
import { unitFactor } from "@/lib/units";
import { rateHistory, vendorPerformance, type VendorPerformance } from "@/lib/vendor-history";
import { within, type DateRange } from "@/lib/date-range";

/**
 * An item page: details and unit conversions, vendors with their record, rate history, stock history,
 * open orders, stock position and what was purchased in the top-bar range. Null when it doesn't exist.
 */
export async function loadItemScreen(id: number, range: DateRange | null) {
  const on = within(range);

  const [item, links, history, stockLog, openLines, onOrder, boughtByUnit] = await Promise.all([
    db.item.findUnique({ where: { id }, include: { stockUpdatedBy: { select: { name: true } }, units: { orderBy: { unit: "asc" } } } }),
    db.vendorItem.findMany({
      where: { itemId: id },
      orderBy: [{ active: "desc" }, { preferred: "desc" }, { rate: { sort: "asc", nulls: "last" } }],
      include: { vendor: { select: { id: true, name: true, city: true, active: true, leadTimeDays: true } } },
    }),
    rateHistory({ itemId: id, range }, 60),
    db.stockCount.findMany({
      where: { itemId: id, countedAt: within(range) },
      orderBy: { countedAt: "desc" },
      take: 30,
      include: { countedBy: { select: { name: true } }, grn: { select: { id: true, grnNumber: true } } },
    }),
    db.poItem.findMany({
      where: { itemId: id, po: { status: { in: RECEIVABLE_PO } } },
      orderBy: { po: { expectedDeliveryDate: "asc" } },
      select: {
        quantity: true,
        quantityReceived: true,
        rate: true,
        uom: true,
        po: { select: { id: true, poNumber: true, expectedDeliveryDate: true, vendor: { select: { name: true } } } },
      },
    }),
    onOrderByItem(),
    // Ordered on issued POs in the date range (all of them, not just the rate history shown below), per unit.
    db.poItem.groupBy({
      by: ["uom"],
      where: {
        itemId: id,
        po: { poNumber: { not: null }, status: { not: "CANCELLED" }, ...(on ? { OR: [{ poDate: on }, { poDate: null, createdAt: on }] } : {}) },
      },
      _sum: { quantity: true, quantityReceived: true, taxableAmount: true },
      _count: true,
    }),
  ]);
  if (!item) return null;

  // Purchased, converted to the item's unit; lines in a unit with no conversion are listed apart.
  const unitItem = toUnitItem(item);
  const bought = { qty: 0, received: 0, value: 0, lines: 0, unconverted: [] as string[] };
  for (const g of boughtByUnit) {
    const f = unitFactor(unitItem, g.uom);
    bought.lines += g._count;
    bought.value += toNumber(g._sum.taxableAmount);
    if (f === null) bought.unconverted.push(`${formatQty(g._sum.quantity)} ${g.uom}`);
    else {
      bought.qty += toNumber(g._sum.quantity) * f;
      bought.received += toNumber(g._sum.quantityReceived) * f;
    }
  }

  const perf = await vendorPerformance(links.map((l) => l.vendorId));
  const packItem = { uom: item.uom, packUnit: item.packUnit, packSize: item.packSize === null ? null : toNumber(item.packSize) };
  const current = item.currentStock === null ? null : toNumber(item.currentStock);
  const position = stockPosition({
    current,
    minStock: item.minStock === null ? null : toNumber(item.minStock),
    reorderQty: item.reorderQty === null ? null : toNumber(item.reorderQty),
    packSize: packItem.packSize,
    onOrder: onOrder.get(id) ?? 0,
  });
  const status = STOCK_STATUS[position.status];
  const lastPO = history.find((h) => h.kind === "PO");
  const activeRates = links.filter((l) => l.active && l.rate !== null).map((l) => toNumber(l.rate));
  const lowest = activeRates.length ? Math.min(...activeRates) : null;
  const pendingLines = openLines
    .map((l) => ({ ...l, pending: Math.max(0, toNumber(l.quantity) - toNumber(l.quantityReceived)) }))
    .filter((l) => l.pending > 0);

  // Plain values / objects so they survive JSON.
  return { item, links, history, stockLog, onOrder: onOrder.get(id) ?? 0, perf: Object.fromEntries(perf) as Record<number, VendorPerformance>, packItem, current, position, status, lastPO, activeRates, lowest, pendingLines, unitItem, bought };
}
