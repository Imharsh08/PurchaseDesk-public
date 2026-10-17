import "server-only";

import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { issueInclude, toIssueRow } from "@/lib/grn";
import { can } from "@/lib/roles";
import { loadTimeline } from "@/lib/screens/timeline";
import type { Role } from "@/generated/prisma/enums";

/** A goods receipt page: the receipt, its lines, documents, issues and history. Null when it doesn't exist. */
export async function loadGoodsReceiptScreen(id: number, user: { roles: Role[] }) {

  const [grn, issues, activity] = await Promise.all([
    db.goodsReceipt.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true } },
        po: { select: { id: true, poNumber: true, expectedDeliveryDate: true, indentId: true } },
        receivedBy: { select: { name: true } },
        qcBy: { select: { name: true } },
        items: {
          orderBy: { poItem: { lineNo: "asc" } },
          include: { item: { select: { sku: true } }, poItem: { select: { description: true, uom: true, quantity: true, rate: true } } },
        },
        documents: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
        bill: { select: { id: true, billNumber: true, status: true } },
        returnedBy: { select: { name: true } },
        storedBy: { select: { name: true } },
      },
    }),
    db.vendorIssue.findMany({ where: { grnId: id }, orderBy: { raisedAt: "desc" }, include: issueInclude }),
    db.auditLog.findMany({
      where: { entityType: "goods_receipt", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!grn) return null;
  const timeline = await loadTimeline(grn.po.indentId, grn.po.id, user.roles);

  const due = grn.po.expectedDeliveryDate;
  const daysLate = due ? Math.round((grn.receivedAt.getTime() - due.getTime()) / 86_400_000) : null;
  const canQc = grn.status === "PENDING_QC" && can(user.roles, "qualityCheck");
  const canReceive = can(user.roles, "receiveGoods");
  const itemOptions = grn.items.map((l) => ({ id: l.itemId, name: l.poItem.description }));
  const rejected = grn.items.some((l) => toNumber(l.rejectedQty) > 0);
  const done = grn.status === "COMPLETED";

  return { grn, issues: issues.map((i) => toIssueRow(i)), activity, daysLate, canQc, canReceive, itemOptions, rejected, done, timeline };
}
