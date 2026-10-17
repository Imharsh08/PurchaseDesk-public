import "server-only";

import { PERFORMANCE_WINDOW_DAYS } from "@/lib/screens/options";

export { PERFORMANCE_WINDOW_DAYS };

import type { DateRange } from "@/lib/date-range";
import { within } from "@/lib/date-range";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";
import { netRate } from "@/lib/quote-scoring";
import { unitFactor } from "@/lib/units";

export type VendorPerformance = {
  vendorId: number;
  /** Completed goods receipts in the window. */
  receipts: number;
  /** Receipts on or before the PO's delivery date, as % of receipts that had one; null if none. */
  onTimePct: number | null;
  /** Average days late across receipts with a delivery date (early = 0). */
  avgDelayDays: number | null;
  /** Average rejected share of received quantity per receipt line, %. */
  rejectionPct: number | null;
  /** Receipt lines that failed the quantity or quality check. */
  failedLines: number;
  lines: number;
  openIssues: number;
  totalIssues: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Delivery, quality and issue history per vendor (all vendors, or the given ones). */
export async function vendorPerformance(vendorIds?: number[]): Promise<Map<number, VendorPerformance>> {
  const since = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 86_400_000);
  const ids = vendorIds?.length ? vendorIds : null;

  const [delivery, quality, issues] = await Promise.all([
    db.$queryRaw<{ vendor_id: number; receipts: bigint; with_due: bigint; on_time: bigint; avg_delay: number | null }[]>`
      SELECT g.vendor_id,
             count(*) AS receipts,
             count(po.expected_delivery_date) AS with_due,
             count(*) FILTER (WHERE g.received_at <= po.expected_delivery_date) AS on_time,
             avg(GREATEST(0, g.received_at - po.expected_delivery_date))::float8 AS avg_delay
      FROM goods_receipts g JOIN purchase_orders po ON po.id = g.po_id
      WHERE g.status = 'COMPLETED' AND g.received_at >= ${since}::date
        AND (${ids}::int[] IS NULL OR g.vendor_id = ANY(${ids}::int[]))
      GROUP BY g.vendor_id`,
    db.$queryRaw<{ vendor_id: number; lines: bigint; failed: bigint; rejection: number | null }[]>`
      SELECT g.vendor_id,
             count(*) AS lines,
             count(*) FILTER (WHERE gi.qty_check = 'FAIL' OR gi.quality_check = 'FAIL') AS failed,
             avg(COALESCE(gi.rejected_qty, 0) / NULLIF(gi.received_qty, 0))::float8 * 100 AS rejection
      FROM goods_receipt_items gi JOIN goods_receipts g ON g.id = gi.grn_id
      WHERE g.status = 'COMPLETED' AND g.received_at >= ${since}::date
        AND (${ids}::int[] IS NULL OR g.vendor_id = ANY(${ids}::int[]))
      GROUP BY g.vendor_id`,
    db.vendorIssue.groupBy({
      by: ["vendorId", "status"],
      where: ids ? { vendorId: { in: ids } } : undefined,
      _count: { _all: true },
    }),
  ]);

  const map = new Map<number, VendorPerformance>();
  const get = (vendorId: number) => {
    let p = map.get(vendorId);
    if (!p) {
      p = { vendorId, receipts: 0, onTimePct: null, avgDelayDays: null, rejectionPct: null, failedLines: 0, lines: 0, openIssues: 0, totalIssues: 0 };
      map.set(vendorId, p);
    }
    return p;
  };
  for (const d of delivery) {
    const p = get(d.vendor_id);
    p.receipts = Number(d.receipts);
    const withDue = Number(d.with_due);
    p.onTimePct = withDue ? r1((Number(d.on_time) / withDue) * 100) : null;
    p.avgDelayDays = d.avg_delay === null ? null : r1(d.avg_delay);
  }
  for (const q of quality) {
    const p = get(q.vendor_id);
    p.lines = Number(q.lines);
    p.failedLines = Number(q.failed);
    p.rejectionPct = q.rejection === null ? null : r1(q.rejection);
  }
  for (const i of issues) {
    const p = get(i.vendorId);
    p.totalIssues += i._count._all;
    if (i.status === "OPEN") p.openIssues += i._count._all;
  }
  return map;
}

export type RateHistoryRow = {
  key: string;
  date: Date;
  kind: "PO" | "QUOTE";
  vendorId: number;
  vendorName: string;
  itemId: number;
  itemName: string;
  sku: string;
  /** The line's own unit (quantity and rate are in it). */
  uom: string;
  /** Net of discount, before GST, per `uom`. */
  rate: number;
  quantity: number | null;
  /** The item's own unit, and the quantity / rate converted to it (null: no conversion known). */
  itemUom: string;
  itemQty: number | null;
  itemRate: number | null;
  ref: string;
  href: string;
  /** Quote chosen on the comparative statement. */
  selected: boolean;
};

/** Every quoted and ordered rate for an item and/or a vendor, newest first; `range` limits it to quote / PO dates. */
export async function rateHistory(filter: { itemId?: number; vendorId?: number; range?: DateRange | null }, take = 100): Promise<RateHistoryRow[]> {
  const on = within(filter.range ?? null);
  const [quotes, orders] = await Promise.all([
    db.quotationItem.findMany({
      where: {
        ...(filter.itemId ? { indentItem: { itemId: filter.itemId } } : {}),
        quotation: {
          ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
          // Same date the row shows: the quote date, else when it was entered.
          ...(on ? { OR: [{ quoteDate: on }, { quoteDate: null, createdAt: on }] } : {}),
        },
      },
      orderBy: { id: "desc" },
      take,
      select: {
        id: true,
        rate: true,
        discountPct: true,
        selectedFor: { select: { id: true } },
        indentItem: { select: { quantity: true, uom: true, item: { select: { id: true, name: true, sku: true, ...unitItemSelect } } } },
        quotation: {
          select: {
            quoteDate: true,
            createdAt: true,
            vendorRef: true,
            vendor: { select: { id: true, name: true } },
            indent: { select: { id: true, indentNumber: true } },
          },
        },
      },
    }),
    db.poItem.findMany({
      where: {
        ...(filter.itemId ? { itemId: filter.itemId } : {}),
        po: {
          poNumber: { not: null },
          status: { not: "CANCELLED" },
          ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
          ...(on ? { OR: [{ poDate: on }, { poDate: null, createdAt: on }] } : {}),
        },
      },
      orderBy: { id: "desc" },
      take,
      select: {
        id: true,
        rate: true,
        discountPct: true,
        quantity: true,
        uom: true,
        item: { select: { id: true, name: true, sku: true, ...unitItemSelect } },
        po: { select: { id: true, poNumber: true, poDate: true, createdAt: true, vendor: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const inItemUnit = (item: Parameters<typeof toUnitItem>[0], qty: number, rate: number, uom: string) => {
    const f = unitFactor(toUnitItem(item), uom);
    return { itemUom: item.uom, itemQty: f === null ? null : qty * f, itemRate: f === null ? null : rate / f };
  };
  const rows: RateHistoryRow[] = [
    ...orders.map((o) => ({
      key: `p${o.id}`,
      date: o.po.poDate ?? o.po.createdAt,
      kind: "PO" as const,
      vendorId: o.po.vendor.id,
      vendorName: o.po.vendor.name,
      itemId: o.item.id,
      itemName: o.item.name,
      sku: o.item.sku,
      uom: o.uom,
      rate: netRate(toNumber(o.rate), toNumber(o.discountPct)),
      quantity: toNumber(o.quantity),
      ...inItemUnit(o.item, toNumber(o.quantity), netRate(toNumber(o.rate), toNumber(o.discountPct)), o.uom),
      ref: o.po.poNumber!,
      href: `/purchase-orders/${o.po.id}`,
      selected: true,
    })),
    ...quotes.map((q) => ({
      key: `q${q.id}`,
      date: q.quotation.quoteDate ?? q.quotation.createdAt,
      kind: "QUOTE" as const,
      vendorId: q.quotation.vendor.id,
      vendorName: q.quotation.vendor.name,
      itemId: q.indentItem.item.id,
      itemName: q.indentItem.item.name,
      sku: q.indentItem.item.sku,
      uom: q.indentItem.uom,
      rate: netRate(toNumber(q.rate), toNumber(q.discountPct)),
      quantity: toNumber(q.indentItem.quantity),
      ...inItemUnit(q.indentItem.item, toNumber(q.indentItem.quantity), netRate(toNumber(q.rate), toNumber(q.discountPct)), q.indentItem.uom),
      ref: q.quotation.indent.indentNumber,
      href: `/indents/${q.quotation.indent.id}#comparison`,
      selected: !!q.selectedFor,
    })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || (a.kind === "PO" ? -1 : 1)).slice(0, take);
}

/** Last ordered rate per item (any vendor), for context on the comparative statement. */
export async function lastPurchaseRates(itemIds: number[]) {
  if (!itemIds.length) return new Map<number, { rate: number; vendorName: string; date: Date; poNumber: string }>();
  const rows = await db.$queryRaw<{ item_id: number; rate: number; vendor_name: string; po_date: Date; po_number: string }[]>`
    SELECT DISTINCT ON (pi.item_id) pi.item_id,
           round(pi.rate * (1 - pi.discount_pct / 100), 2)::float8 AS rate,
           v.name AS vendor_name, COALESCE(po.po_date, po.created_at) AS po_date, po.po_number
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    JOIN vendors v ON v.id = po.vendor_id
    WHERE pi.item_id = ANY(${itemIds}::int[]) AND po.po_number IS NOT NULL AND po.status <> 'CANCELLED'
      -- Lines without a recorded rate (e.g. imported from the FMS sheet) are not a price.
      AND pi.rate > 0
    ORDER BY pi.item_id, COALESCE(po.po_date, po.created_at) DESC`;
  return new Map(rows.map((r) => [r.item_id, { rate: r.rate, vendorName: r.vendor_name, date: r.po_date, poNumber: r.po_number }]));
}
