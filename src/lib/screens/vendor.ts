import "server-only";

import { db } from "@/lib/db";

import { formatAmount } from "@/lib/format";
import { issueInclude, toIssueRow } from "@/lib/grn";
import { can } from "@/lib/roles";
import { loadTransportOptions } from "@/lib/transport-data";
import { rateHistory, vendorPerformance } from "@/lib/vendor-history";
import type { POStatus, Role } from "@/generated/prisma/enums";
import { within, type DateRange } from "@/lib/date-range";

/** POs that count as business with the vendor. */
const ISSUED: POStatus[] = ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "COMPLETED"];

/**
 * A vendor page: details, items supplied with last PO rates, rate history, performance, POs,
 * deliveries and issues — dated ones within the top-bar range. Null when the vendor doesn't exist.
 */
export async function loadVendorScreen(id: number, range: DateRange | null, user: { roles: Role[] }) {
  const on = within(range);
  const poDated = on ? { OR: [{ poDate: on }, { poDate: null, createdAt: on }] } : {};

  const [vendor, links, allItems, history, perf, orders, poAgg, receipts, issues, transport] = await Promise.all([
    db.vendor.findUnique({ where: { id } }),
    db.vendorItem.findMany({
      where: { vendorId: id },
      orderBy: [{ active: "desc" }, { preferred: "desc" }, { item: { name: "asc" } }],
      include: { item: { select: { id: true, name: true, sku: true, uom: true } } },
    }),
    db.item.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, uom: true } }),
    rateHistory({ vendorId: id, range }, 60),
    vendorPerformance([id]),
    db.purchaseOrder.findMany({
      where: { vendorId: id, poNumber: { not: null }, ...poDated },
      orderBy: { poDate: "desc" },
      take: 10,
      select: { id: true, poNumber: true, poDate: true, status: true, grandTotal: true, expectedDeliveryDate: true },
    }),
    db.purchaseOrder.aggregate({ where: { vendorId: id, status: { in: ISSUED }, ...poDated }, _sum: { grandTotal: true }, _count: true }),
    db.goodsReceipt.findMany({
      where: { vendorId: id, receivedAt: on },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 15,
      select: {
        id: true,
        grnNumber: true,
        status: true,
        receivedAt: true,
        po: { select: { poNumber: true, expectedDeliveryDate: true } },
        items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true, qtyCheck: true, qualityCheck: true } },
      },
    }),
    db.vendorIssue.findMany({ where: { vendorId: id, raisedAt: on }, orderBy: [{ status: "asc" }, { raisedAt: "desc" }], take: 50, include: issueInclude }),
    loadTransportOptions(),
  ]);
  if (!vendor) return null;

  const p = perf.get(id);
  // Last PO rate per item, in the item's unit like the agreed rate beside it (else in the PO's own unit).
  const lastPoRate = new Map<number, string>();
  for (const h of history) {
    if (h.kind !== "PO" || lastPoRate.has(h.itemId)) continue;
    lastPoRate.set(h.itemId, h.itemRate !== null ? `₹${formatAmount(h.itemRate)}` : `₹${formatAmount(h.rate)}/${h.uom}`);
  }
  const canEdit = can(user.roles, "manageMasters");
  const itemOptions = allItems;

  return {
    vendor,
    links,
    history,
    p,
    // Keyed by item id; a plain object so it survives JSON.
    lastPoRate: Object.fromEntries(lastPoRate) as Record<number, string>,
    orders,
    poAgg,
    receipts,
    issues: issues.map((i) => toIssueRow(i, { showRef: true })), canEdit, itemOptions, transport };
}
