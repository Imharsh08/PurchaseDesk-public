import "server-only";

import { GRN_VIEWS, type GrnView } from "@/lib/screens/options";

import { within, type DateRange } from "@/lib/date-range";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { RECEIVABLE_PO, issueInclude, toIssueRow } from "@/lib/grn";

/**
 * Goods receipt screen. Top-bar date range: open POs by PO date, receipts by date received, issues
 * by date raised. Only the chosen view's list is loaded; the counts are always there.
 */
export async function loadGoodsReceiptsScreen({ view: viewKey, limit, range }: { view: string | undefined; limit: number; range: DateRange | null }) {
  const view: GrnView = GRN_VIEWS.find((v) => v.key === viewKey)?.key ?? "awaiting";
  const on = within(range);
  const today = new Date();

  const [openPOs, receipts, pendingCount, openIssues, issues, receiptCount] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { status: { in: RECEIVABLE_PO }, poDate: on },
      orderBy: [{ expectedDeliveryDate: { sort: "asc", nulls: "last" } }, { poDate: "asc" }],
      select: {
        id: true,
        poNumber: true,
        status: true,
        poDate: true,
        expectedDeliveryDate: true,
        vendor: { select: { id: true, name: true } },
        items: { orderBy: { lineNo: "asc" }, select: { description: true, uom: true, quantity: true, quantityReceived: true } },
        _count: { select: { goodsReceipts: { where: { status: "PENDING_QC" } } } },
      },
    }),
    view === "awaiting" || view === "issues"
      ? Promise.resolve([])
      : db.goodsReceipt.findMany({
          where: { receivedAt: on, ...(view === "pending" ? { status: "PENDING_QC" } : {}) },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          take: limit,
          include: {
            vendor: { select: { id: true, name: true } },
            po: { select: { id: true, poNumber: true } },
            receivedBy: { select: { name: true } },
            // What came in (the list shows the first few lines).
            items: { orderBy: { poItem: { lineNo: "asc" } }, take: 3, select: { receivedQty: true, acceptedQty: true, poItem: { select: { description: true, uom: true } } } },
            _count: { select: { items: true, issues: true, documents: { where: { status: "ACTIVE" } } } },
          },
        }),
    db.goodsReceipt.count({ where: { status: "PENDING_QC", receivedAt: on } }),
    db.vendorIssue.count({ where: { status: "OPEN", raisedAt: on } }),
    view === "issues"
      ? db.vendorIssue.findMany({ where: { status: "OPEN", raisedAt: on }, orderBy: { raisedAt: "desc" }, take: limit, include: issueInclude })
      : Promise.resolve([]),
    // "Pending check" already has its count above.
    view === "all" ? db.goodsReceipt.count({ where: { receivedAt: on } }) : Promise.resolve(0),
  ]);

  // Open POs with quantity still to come, and how many days late they are.
  const awaiting = openPOs
    .map((po) => {
      const lines = po.items
        .map((l) => ({ ...l, pending: Math.max(0, toNumber(l.quantity) - toNumber(l.quantityReceived)) }))
        .filter((l) => l.pending > 0);
      const overdueDays = po.expectedDeliveryDate ? Math.floor((today.getTime() - po.expectedDeliveryDate.getTime()) / 86_400_000) : null;
      return { ...po, lines, overdueDays };
    })
    .filter((po) => po.lines.length > 0);

  return {
    view,
    awaiting,
    overdue: awaiting.filter((p) => p.overdueDays !== null && p.overdueDays > 0).length,
    receipts,
    receiptTotal: view === "pending" ? pendingCount : receiptCount,
    pendingCount,
    openIssues,
    issues: issues.map((i) => toIssueRow(i, { showVendor: true, showRef: true })),
  };
}

export { GRN_VIEWS, type GrnView } from "@/lib/screens/options";
