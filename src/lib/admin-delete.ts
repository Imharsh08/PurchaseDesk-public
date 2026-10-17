import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { POStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/action-error";
import { toNumber } from "@/lib/format";

/**
 * Permanent deletion of records entered by mistake. A record is only removed together with its own
 * parts (lines, files, payments); if later records depend on it, deletion is refused with a message
 * saying what to delete first, so nothing is left pointing at a missing record.
 */

/** The record no longer exists (deleted earlier, e.g. a retried request): nothing left to do. */
export class AlreadyDeleted extends ActionError {
  constructor(public redirectTo: string) {
    super("Already deleted.");
  }
}

export type DeletableEntity = "indent" | "quotation" | "purchase_order" | "goods_receipt" | "bill" | "item" | "vendor";

type Tx = Prisma.TransactionClient;
type Deleted = { label: string; redirectTo: string; audit: { entityType: DeletableEntity; entityId: number; snapshot: Prisma.InputJsonValue } };

const list = (values: (string | null)[], max = 5) => {
  const v = values.filter(Boolean) as string[];
  return v.length > max ? `${v.slice(0, max).join(", ")} and ${v.length - max} more` : v.join(", ");
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function deleteIndent(tx: Tx, id: number): Promise<Deleted> {
  const indent = await tx.indent.findUnique({
    where: { id },
    select: { indentNumber: true, status: true, purchaseOrders: { select: { id: true, poNumber: true } }, _count: { select: { quotations: true, items: true } } },
  });
  if (!indent) throw new AlreadyDeleted("/indents");
  if (indent.purchaseOrders.length) {
    throw new ActionError(
      `Purchase orders were created from ${indent.indentNumber} (${list(indent.purchaseOrders.map((p) => p.poNumber ?? `draft #${p.id}`))}). Delete those first.`,
    );
  }
  await tx.indent.delete({ where: { id } }); // lines and quotations go with it
  return {
    label: `${indent.indentNumber} with ${plural(indent._count.quotations, "quotation")}`,
    redirectTo: "/indents",
    audit: { entityType: "indent", entityId: id, snapshot: { indentNumber: indent.indentNumber, status: indent.status, lines: indent._count.items } },
  };
}

async function deleteQuotation(tx: Tx, id: number): Promise<Deleted> {
  const q = await tx.quotation.findUnique({
    where: { id },
    select: {
      indentId: true,
      vendor: { select: { name: true } },
      indent: { select: { indentNumber: true, status: true } },
      purchaseOrders: { select: { id: true, poNumber: true } },
      items: { select: { selectedFor: { select: { id: true } } } },
    },
  });
  if (!q) throw new AlreadyDeleted("/indents");
  if (q.purchaseOrders.length) {
    throw new ActionError(`Purchase orders were created from this quotation (${list(q.purchaseOrders.map((p) => p.poNumber ?? `draft #${p.id}`))}). Delete those first.`);
  }
  const wasSelected = q.items.some((i) => i.selectedFor);
  await tx.quotation.delete({ where: { id } });
  // The comparison it was chosen on no longer holds: the indent goes back to collecting quotes.
  if (wasSelected && (q.indent.status === "PENDING_APPROVAL" || q.indent.status === "APPROVED")) {
    await tx.indent.update({
      where: { id: q.indentId },
      data: { status: "OPEN", comparisonSubmittedAt: null, comparisonSubmittedById: null, approvedAt: null, approvedById: null, comparisonValue: null },
    });
  }
  return {
    label: `${q.vendor.name}'s quotation on ${q.indent.indentNumber}`,
    redirectTo: `/indents/${q.indentId}#quotations`,
    audit: { entityType: "quotation", entityId: id, snapshot: { indentId: q.indentId, vendor: q.vendor.name, reopenedIndent: wasSelected } },
  };
}

async function deletePurchaseOrder(tx: Tx, id: number): Promise<Deleted> {
  const po = await tx.purchaseOrder.findUnique({
    where: { id },
    select: {
      poNumber: true,
      status: true,
      grandTotal: true,
      indentId: true,
      vendor: { select: { name: true } },
      goodsReceipts: { select: { grnNumber: true } },
      bills: { select: { billNumber: true } },
    },
  });
  if (!po) throw new AlreadyDeleted("/purchase-orders");
  const name = po.poNumber ?? `Draft PO #${id}`;
  if (po.bills.length) throw new ActionError(`${name} has bills (${list(po.bills.map((b) => b.billNumber))}). Delete those first.`);
  if (po.goodsReceipts.length) throw new ActionError(`Material was received against ${name} (${list(po.goodsReceipts.map((g) => g.grnNumber))}). Delete those receipts first.`);

  await tx.purchaseOrder.delete({ where: { id } }); // lines, PDFs and amendments go with it
  // The indent's vendor selection is still approved: once no PO is left, the PO can be created again.
  if (po.indentId) {
    const remaining = await tx.purchaseOrder.count({ where: { indentId: po.indentId } });
    if (!remaining) await tx.indent.updateMany({ where: { id: po.indentId, status: "ORDERED" }, data: { status: "APPROVED" } });
  }
  return {
    label: `${name} (${po.vendor.name})`,
    redirectTo: "/purchase-orders",
    audit: { entityType: "purchase_order", entityId: id, snapshot: { poNumber: po.poNumber, status: po.status, vendor: po.vendor.name, grandTotal: toNumber(po.grandTotal) } },
  };
}

async function deleteGoodsReceipt(tx: Tx, id: number): Promise<Deleted> {
  const grn = await tx.goodsReceipt.findUnique({
    where: { id },
    select: {
      grnNumber: true,
      status: true,
      poId: true,
      bill: { select: { billNumber: true } },
      items: { select: { poItemId: true, itemId: true, acceptedQty: true } },
      po: { select: { status: true, shortClosedAt: true, acknowledgedAt: true, sentAt: true } },
    },
  });
  if (!grn) throw new AlreadyDeleted("/goods-receipts");
  if (grn.bill) throw new ActionError(`${grn.grnNumber} has bill ${grn.bill.billNumber}. Delete the bill first.`);

  // A checked receipt added its accepted quantity to stock and to the PO: take it back out.
  if (grn.status === "COMPLETED") {
    for (const line of grn.items) {
      const accepted = toNumber(line.acceptedQty);
      if (accepted <= 0) continue;
      await tx.poItem.update({ where: { id: line.poItemId }, data: { quantityReceived: { decrement: accepted } } });
    }
    // Stock: take back what each receipt entry added (in the item's unit, after any unit conversion).
    const entries = await tx.stockCount.findMany({ where: { grnId: id, kind: "RECEIPT" }, select: { itemId: true, quantity: true, previousQty: true } });
    for (const e of entries) {
      const added = toNumber(e.quantity) - toNumber(e.previousQty);
      const item = await tx.item.findUniqueOrThrow({ where: { id: e.itemId }, select: { currentStock: true } });
      if (item.currentStock !== null && added > 0) {
        await tx.item.update({ where: { id: e.itemId }, data: { currentStock: Math.max(0, toNumber(item.currentStock) - added) } });
      }
    }
    await tx.stockCount.deleteMany({ where: { grnId: id } });
  }
  await tx.goodsReceipt.delete({ where: { id } }); // lines and attached documents go with it

  if (grn.status === "COMPLETED" && !grn.po.shortClosedAt && (grn.po.status === "COMPLETED" || grn.po.status === "PARTIALLY_RECEIVED")) {
    const lines = await tx.poItem.findMany({ where: { poId: grn.poId }, select: { quantity: true, quantityReceived: true } });
    const any = lines.some((l) => toNumber(l.quantityReceived) > 0);
    const done = lines.every((l) => toNumber(l.quantityReceived) >= toNumber(l.quantity));
    const status: POStatus = any ? (done ? "COMPLETED" : "PARTIALLY_RECEIVED") : grn.po.acknowledgedAt ? "ACKNOWLEDGED" : grn.po.sentAt ? "SENT" : "APPROVED";
    await tx.purchaseOrder.update({ where: { id: grn.poId }, data: { status } });
  }
  return {
    label: grn.grnNumber,
    redirectTo: "/goods-receipts",
    audit: { entityType: "goods_receipt", entityId: id, snapshot: { grnNumber: grn.grnNumber, status: grn.status, poId: grn.poId, stockReversed: grn.status === "COMPLETED" } },
  };
}

async function deleteBill(tx: Tx, id: number): Promise<Deleted> {
  const bill = await tx.bill.findUnique({
    where: { id },
    select: { billNumber: true, invoiceNo: true, totalAmount: true, paidAmount: true, vendor: { select: { name: true } }, _count: { select: { payments: true } } },
  });
  if (!bill) throw new AlreadyDeleted("/bills");
  await tx.bill.delete({ where: { id } }); // lines and payments go with it
  return {
    label: `${bill.billNumber} (invoice ${bill.invoiceNo}, ${bill.vendor.name})${bill._count.payments ? ` with ${plural(bill._count.payments, "payment")}` : ""}`,
    redirectTo: "/bills",
    audit: {
      entityType: "bill",
      entityId: id,
      snapshot: { billNumber: bill.billNumber, invoiceNo: bill.invoiceNo, total: toNumber(bill.totalAmount), paid: toNumber(bill.paidAmount) },
    },
  };
}

async function deleteItem(tx: Tx, id: number): Promise<Deleted> {
  const item = await tx.item.findUnique({
    where: { id },
    select: { sku: true, name: true, _count: { select: { poItems: true, indentItems: true, grnItems: true } } },
  });
  if (!item) throw new AlreadyDeleted("/items");
  const used = [
    item._count.indentItems && plural(item._count.indentItems, "indent line"),
    item._count.poItems && plural(item._count.poItems, "PO line"),
    item._count.grnItems && plural(item._count.grnItems, "goods receipt line"),
  ].filter(Boolean);
  if (used.length) throw new ActionError(`${item.name} is used on ${used.join(", ")}. Mark it inactive instead, or delete those records first.`);
  await tx.item.delete({ where: { id } }); // stock history and vendor links go with it
  return { label: `${item.name} (${item.sku})`, redirectTo: "/items", audit: { entityType: "item", entityId: id, snapshot: { sku: item.sku, name: item.name } } };
}

async function deleteVendor(tx: Tx, id: number): Promise<Deleted> {
  const vendor = await tx.vendor.findUnique({
    where: { id },
    select: { code: true, name: true, _count: { select: { purchaseOrders: true, quotations: true, goodsReceipts: true, bills: true, issues: true, items: true } } },
  });
  if (!vendor) throw new AlreadyDeleted("/vendors");
  const c = vendor._count;
  const used = [
    c.quotations && plural(c.quotations, "quotation"),
    c.purchaseOrders && plural(c.purchaseOrders, "purchase order"),
    c.goodsReceipts && plural(c.goodsReceipts, "goods receipt"),
    c.bills && plural(c.bills, "bill"),
    c.issues && plural(c.issues, "vendor issue"),
  ].filter(Boolean);
  if (used.length) throw new ActionError(`${vendor.name} has ${used.join(", ")}. Mark the vendor inactive instead, or delete those records first.`);
  await tx.vendor.delete({ where: { id } }); // item links go with it
  return {
    label: `${vendor.name} (${vendor.code})${c.items ? ` and its ${plural(c.items, "item link")}` : ""}`,
    redirectTo: "/vendors",
    audit: { entityType: "vendor", entityId: id, snapshot: { code: vendor.code, name: vendor.name, itemLinks: c.items } },
  };
}

const DELETERS: Record<DeletableEntity, (tx: Tx, id: number) => Promise<Deleted>> = {
  indent: deleteIndent,
  quotation: deleteQuotation,
  purchase_order: deletePurchaseOrder,
  goods_receipt: deleteGoodsReceipt,
  bill: deleteBill,
  item: deleteItem,
  vendor: deleteVendor,
};

export function isDeletable(entity: string): entity is DeletableEntity {
  return entity in DELETERS;
}

export function hardDelete(entity: DeletableEntity, id: number) {
  return db.$transaction((tx) => DELETERS[entity](tx, id), { timeout: 30_000 });
}
