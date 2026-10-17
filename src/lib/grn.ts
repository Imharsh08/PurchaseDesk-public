import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { POStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dateFormatter, formatDateTime, toNumber } from "@/lib/format";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";

type Tx = Prisma.TransactionClient;

/** POs that material can be received against. */
export const RECEIVABLE_PO: POStatus[] = ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"];

/** Issue select + mapper for <IssueList>. */
export const issueInclude = {
  raisedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
  grn: { select: { id: true, grnNumber: true } },
  po: { select: { id: true, poNumber: true } },
  vendor: { select: { id: true, name: true } },
} as const;

type IssueWithRefs = Prisma.VendorIssueGetPayload<{ include: typeof issueInclude }>;

export function toIssueRow(i: IssueWithRefs, opts: { showVendor?: boolean; showRef?: boolean } = {}) {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    description: i.description,
    qtyAffected: i.qtyAffected?.toString() ?? null,
    raisedBy: i.raisedBy.name,
    raisedAt: formatDateTime(i.raisedAt),
    resolution: i.resolution,
    resolvedBy: i.resolvedBy?.name ?? null,
    resolvedAt: i.resolvedAt ? formatDateTime(i.resolvedAt) : null,
    vendor: opts.showVendor ? { name: i.vendor.name, href: `/vendors/${i.vendor.id}` } : null,
    ref: !opts.showRef
      ? null
      : i.grn
        ? { label: i.grn.grnNumber, href: `/goods-receipts/${i.grn.id}` }
        : i.po?.poNumber
          ? { label: i.po.poNumber, href: `/purchase-orders/${i.po.id}` }
          : null,
  };
}

/** GRN-2026-0001: one running sequence, year of receipt in IST. */
export async function nextGrnNumber(tx: Tx, date = new Date()) {
  const counter = await tx.counter.upsert({
    where: { key: "GRN:SEQ" },
    create: { key: "GRN:SEQ", value: 1 },
    update: { value: { increment: 1 } },
  });
  const year = dateFormatter("en-CA", { year: "numeric" }).format(date);
  return `GRN-${year}-${String(counter.value).padStart(4, "0")}`;
}

/**
 * A PO's lines with what is still to come: ordered − accepted − already received but awaiting
 * the quality check (so the same lot isn't received twice).
 */
export async function loadReceivablePO(poId: number) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      vendor: { select: { id: true, name: true, code: true, gstin: true } },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          item: { select: { sku: true, ...unitItemSelect } },
          grnItems: { where: { grn: { status: "PENDING_QC" } }, select: { receivedQty: true } },
        },
      },
    },
  });
  if (!po) return null;
  const lines = po.items.map((l) => {
    const ordered = toNumber(l.quantity);
    const accepted = toNumber(l.quantityReceived);
    const awaitingCheck = l.grnItems.reduce((s, g) => s + toNumber(g.receivedQty), 0);
    return {
      poItemId: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      sku: l.item.sku,
      description: l.description,
      uom: l.uom,
      packUnit: l.item.packUnit,
      packSize: l.item.packSize === null ? null : toNumber(l.item.packSize),
      rate: toNumber(l.rate),
      /** The item's own unit, pack and conversions (to convert an invoice's unit to this line's). */
      unitItem: toUnitItem(l.item),
      ordered,
      accepted,
      awaitingCheck,
      pending: Math.max(0, ordered - accepted - awaitingCheck),
    };
  });
  return { po, lines };
}

/** After a quality check: PO is complete when every line's accepted qty reaches the ordered qty. */
export async function refreshPOReceiptStatus(tx: Tx, poId: number) {
  const lines = await tx.poItem.findMany({ where: { poId }, select: { quantity: true, quantityReceived: true } });
  const done = lines.every((l) => toNumber(l.quantityReceived) >= toNumber(l.quantity));
  const any = lines.some((l) => toNumber(l.quantityReceived) > 0);
  if (!any) return;
  await tx.purchaseOrder.updateMany({
    where: { id: poId, status: { in: RECEIVABLE_PO } },
    data: { status: done ? "COMPLETED" : "PARTIALLY_RECEIVED" },
  });
}
