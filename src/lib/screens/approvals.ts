import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { withinLimit } from "@/lib/approval";
import { db } from "@/lib/db";
import { formatINR, toNumber } from "@/lib/format";
import { poDisplayNumber } from "@/lib/po-status";
import { fileKind } from "@/lib/reports";
import { can, isAdmin } from "@/lib/roles";
import type { FileRef } from "@/components/file-icons";

/**
 * Approvals ("action center" dashboard): everything waiting for a decision — comparisons to
 * approve, POs and amendments to approve, bills to pass — with who raised each, how long it has
 * waited, its approval chain, how much of the user's approval limit it uses, and whether this user
 * may decide it (role, own-submission rule, limit). Plus this month's decisions and today's work.
 */

export type ApprovalKind = "comparison" | "po" | "amendment" | "bill";

export type ChainStep = { label: string; who: string | null; at: Date | null; state: "done" | "current" | "next" };

export type ApprovalItem = {
  key: string;
  kind: ApprovalKind;
  id: number;
  title: string;
  ref: string;
  href: string;
  requester: string;
  department: string | null;
  raisedAt: Date;
  /** Waiting for a decision since. */
  since: Date;
  urgent: boolean;
  amount: number;
  /** What the decision is about, in a line (vendor, quotes, changes, debit). */
  detail: string | null;
  /** The last time it was sent back, if it was. */
  sentBack: string | null;
  chain: ChainStep[];
  /** Share of the user's approval limit this uses (null = no limit). */
  limitShare: number | null;
  canAct: boolean;
  /** Why this user can't decide it (own submission, above limit, role). */
  blocked: string | null;
  /** Papers to look at before deciding (quotations, PO copy, invoice, bilty…), opened straight from the card. */
  files: FileRef[];
};

type Approver = { id: number; roles: Role[]; approvalLimit: number | null };

const startOfDayIST = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 3_600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3_600_000);
};
const startOfMonthIST = (d = new Date()) => {
  const day = startOfDayIST(d);
  const ist = new Date(day.getTime() + 5.5 * 3_600_000);
  ist.setUTCDate(1);
  return new Date(ist.getTime() - 5.5 * 3_600_000);
};

/** A record's stored documents (PO copy, invoice, bilty, certificate…), oldest first. */
const DOCS = { where: { status: "ACTIVE" as const }, orderBy: { createdAt: "asc" as const }, select: { id: true, type: true, grnId: true, fileName: true } };
type Doc = { id: number; type: string; grnId: number | null; fileName: string };
const docFile = (d: Doc): FileRef => ({ kind: fileKind(d), name: d.fileName, href: `/api/documents/${d.id}` });
/** The PO as the vendor will see it (a draft preview until it's approved and numbered). */
const poCopy = (po: { id: number; poNumber: string | null }): FileRef => ({ kind: "PO", name: po.poNumber ?? "Draft preview", href: `/api/purchase-orders/${po.id}/pdf` });
/** The PO's own documents, without stored copies of its PDF (the PO copy link serves the current one). */
const poDocs = (docs: Doc[]) => docs.filter((d) => d.type !== "PO_PDF" && d.grnId === null).map(docFile);

export async function loadApprovals(user: Approver) {
  const mayComparison = can(user.roles, "approveComparison");
  const mayPO = can(user.roles, "approvePO");
  const mayBill = can(user.roles, "passBill");
  const admin = isAdmin(user.roles);
  const monthStart = startOfMonthIST();
  const dayStart = startOfDayIST();

  const [comparisons, pos, amendments, bills, decisionsMonth, decidedToday] = await Promise.all([
    db.indent.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { comparisonSubmittedAt: "asc" },
      select: {
        id: true,
        indentNumber: true,
        department: true,
        priority: true,
        submittedAt: true,
        comparisonSubmittedAt: true,
        comparisonSubmittedById: true,
        comparisonValue: true,
        rejectionReason: true,
        requestedBy: { select: { name: true } },
        comparisonSubmittedBy: { select: { name: true } },
        items: { orderBy: { lineNo: "asc" }, take: 2, select: { description: true } },
        quotations: { where: { attachmentPath: { not: null } }, orderBy: { id: "asc" }, select: { id: true, attachmentName: true, vendor: { select: { name: true } } } },
        _count: { select: { items: true, quotations: true } },
      },
    }),
    db.purchaseOrder.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { submittedAt: "asc" },
      select: {
        id: true,
        poNumber: true,
        grandTotal: true,
        createdAt: true,
        submittedAt: true,
        createdById: true,
        rejectionReason: true,
        createdBy: { select: { name: true } },
        vendor: { select: { name: true } },
        indent: { select: { indentNumber: true, department: true, priority: true } },
        quotation: { select: { id: true, attachmentPath: true, attachmentName: true } },
        documents: DOCS,
        _count: { select: { items: true } },
      },
    }),
    db.poAmendment.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      select: {
        id: true,
        revisionNo: true,
        reason: true,
        summary: true,
        oldTotal: true,
        newTotal: true,
        requestedAt: true,
        requestedById: true,
        requestedBy: { select: { name: true } },
        po: { select: { id: true, poNumber: true, vendor: { select: { name: true } }, indent: { select: { department: true } }, documents: DOCS } },
      },
    }),
    db.bill.findMany({
      where: { status: "ENTERED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        billNumber: true,
        invoiceNo: true,
        totalAmount: true,
        payableAmount: true,
        debitAmount: true,
        dueDate: true,
        msme: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        vendor: { select: { name: true } },
        grn: { select: { grnNumber: true, receivedAt: true, receivedBy: { select: { name: true } }, documents: DOCS } },
        po: { select: { id: true, poNumber: true, indent: { select: { department: true } } } },
      },
    }),
    db.auditLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: monthStart }, action: { in: ["approve", "reject", "hold"] }, entityType: { in: ["indent", "purchase_order", "goods_receipt"] } },
      _count: { _all: true },
    }),
    db.auditLog.count({ where: { userId: user.id, createdAt: { gte: dayStart }, action: { in: ["approve", "reject", "hold"] } } }),
  ]);

  const share = (amount: number) => (user.approvalLimit === null || user.approvalLimit <= 0 ? null : Math.round((amount / user.approvalLimit) * 100));
  const limitNote = (amount: number) => (withinLimit(user, amount) || admin ? null : `Above your approval limit of ${formatINR(user.approvalLimit ?? 0)}`);
  const you = "You";

  const items: ApprovalItem[] = [
    ...comparisons.map((c): ApprovalItem => {
      const amount = toNumber(c.comparisonValue);
      const own = !admin && c.comparisonSubmittedById === user.id;
      const blocked = !mayComparison ? "Your role can't approve comparisons" : own ? "You submitted this comparison; another approver must decide" : limitNote(amount);
      return {
        key: `c${c.id}`,
        kind: "comparison",
        id: c.id,
        title: c.items.map((i) => i.description).join(", ") + (c._count.items > 2 ? ` +${c._count.items - 2} more` : ""),
        ref: c.indentNumber,
        href: `/indents/${c.id}#comparison`,
        requester: c.requestedBy.name,
        department: c.department,
        raisedAt: c.submittedAt ?? c.comparisonSubmittedAt ?? new Date(),
        since: c.comparisonSubmittedAt ?? new Date(),
        urgent: c.priority === "URGENT",
        amount,
        detail: `${c._count.quotations} quotation${c._count.quotations === 1 ? "" : "s"} compared · vendor selection incl. GST`,
        sentBack: c.rejectionReason,
        chain: [
          { label: "Raised", who: c.requestedBy.name, at: c.submittedAt, state: "done" },
          { label: "Quotes compared", who: c.comparisonSubmittedBy?.name ?? null, at: c.comparisonSubmittedAt, state: "done" },
          { label: "Approval", who: blocked ? "Approver" : you, at: null, state: "current" },
          { label: "Purchase order", who: null, at: null, state: "next" },
        ],
        limitShare: share(amount),
        canAct: !blocked,
        blocked,
        files: c.quotations.map((q) => ({ kind: "QUOTE", name: `${q.vendor.name}${q.attachmentName ? ` — ${q.attachmentName}` : ""}`, href: `/api/quotations/${q.id}/file` })),
      };
    }),
    ...pos.map((p): ApprovalItem => {
      const amount = toNumber(p.grandTotal);
      const own = !admin && p.createdById === user.id;
      const blocked = !mayPO ? "Your role can't approve purchase orders" : own ? "You created this PO; another approver must decide" : limitNote(amount);
      return {
        key: `p${p.id}`,
        kind: "po",
        id: p.id,
        title: `${p.vendor.name} · ${p._count.items} item${p._count.items === 1 ? "" : "s"}`,
        ref: poDisplayNumber(p),
        href: `/purchase-orders/${p.id}?do=approve`,
        requester: p.createdBy.name,
        department: p.indent?.department ?? null,
        raisedAt: p.createdAt,
        since: p.submittedAt ?? p.createdAt,
        urgent: p.indent?.priority === "URGENT",
        amount,
        detail: p.indent ? `From indent ${p.indent.indentNumber}` : "Direct PO (no indent)",
        sentBack: p.rejectionReason,
        chain: [
          { label: "Created", who: p.createdBy.name, at: p.createdAt, state: "done" },
          { label: "Approval", who: blocked ? "Approver" : you, at: null, state: "current" },
          { label: "Send to vendor", who: null, at: null, state: "next" },
        ],
        limitShare: share(amount),
        canAct: !blocked,
        blocked,
        files: [
          poCopy(p),
          ...(p.quotation?.attachmentPath ? [{ kind: "QUOTE" as const, name: `${p.vendor.name}${p.quotation.attachmentName ? ` — ${p.quotation.attachmentName}` : ""}`, href: `/api/quotations/${p.quotation.id}/file` }] : []),
          ...poDocs(p.documents),
        ],
      };
    }),
    ...amendments.map((a): ApprovalItem => {
      const amount = toNumber(a.newTotal);
      const own = !admin && a.requestedById === user.id;
      const blocked = !mayPO ? "Your role can't approve amendments" : own ? "You requested this amendment; another approver must decide" : limitNote(amount);
      const changes = Array.isArray(a.summary) ? (a.summary as string[]) : [];
      return {
        key: `a${a.id}`,
        kind: "amendment",
        id: a.id,
        title: `${a.po.vendor.name} · Rev. ${a.revisionNo}`,
        ref: a.po.poNumber ?? `PO #${a.po.id}`,
        href: `/purchase-orders/${a.po.id}`,
        requester: a.requestedBy.name,
        department: a.po.indent?.department ?? null,
        raisedAt: a.requestedAt,
        since: a.requestedAt,
        urgent: false,
        amount,
        detail: [`${formatINR(toNumber(a.oldTotal))} → ${formatINR(amount)}`, ...changes.slice(0, 2)].join(" · ") + (a.reason ? ` · ${a.reason}` : ""),
        sentBack: null,
        chain: [
          { label: "Requested", who: a.requestedBy.name, at: a.requestedAt, state: "done" },
          { label: "Approval", who: blocked ? "Approver" : you, at: null, state: "current" },
          { label: "Re-issue to vendor", who: null, at: null, state: "next" },
        ],
        limitShare: share(amount),
        canAct: !blocked,
        blocked,
        // The PO as it stands now (before this amendment) and what's attached to it.
        files: [{ ...poCopy(a.po), name: `${poCopy(a.po).name} (current)` }, ...poDocs(a.po.documents)],
      };
    }),
    ...bills.map((b): ApprovalItem => {
      const total = toNumber(b.totalAmount);
      const payable = toNumber(b.payableAmount);
      const debit = toNumber(b.debitAmount);
      const blocked = mayBill ? null : "Your role can't pass bills";
      return {
        key: `b${b.id}`,
        kind: "bill",
        id: b.id,
        title: `${b.vendor.name} · invoice ${b.invoiceNo}`,
        ref: b.billNumber,
        href: `/bills/${b.id}`,
        requester: b.createdBy.name,
        department: b.po.indent?.department ?? null,
        raisedAt: b.createdAt,
        since: b.createdAt,
        urgent: b.msme && b.dueDate.getTime() - Date.now() < 7 * 86_400_000,
        // The invoice is what's being passed; the debit (if any) and what gets paid are in the line below.
        amount: total,
        detail:
          debit > 0
            ? `Payable ${formatINR(payable)} after debit ${formatINR(debit)} (above PO rate / quantity)`
            : `Matched with ${b.grn.grnNumber} · due ${b.dueDate.toISOString().slice(0, 10)}${b.msme ? " · MSME" : ""}`,
        sentBack: null,
        chain: [
          { label: "Received", who: b.grn.receivedBy.name, at: b.grn.receivedAt, state: "done" },
          { label: "Bill entered", who: b.createdBy.name, at: b.createdAt, state: "done" },
          { label: "Pass for payment", who: blocked ? "Accounts" : you, at: null, state: "current" },
          { label: "Payment", who: null, at: null, state: "next" },
        ],
        limitShare: null,
        canAct: !blocked,
        blocked,
        files: [...b.grn.documents.map(docFile), poCopy(b.po)],
      };
    }),
  ];

  // Pending value by department (for the "Pending value" card).
  const byDept = new Map<string, number>();
  for (const i of items) byDept.set(i.department ?? "Other", (byDept.get(i.department ?? "Other") ?? 0) + i.amount);
  const departments = [...byDept].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const decided = Object.fromEntries(decisionsMonth.map((d) => [d.action, d._count._all])) as Record<string, number | undefined>;
  return {
    items,
    stats: {
      pending: items.length,
      mine: items.filter((i) => i.canAct).length,
      approvedThisMonth: decided.approve ?? 0,
      sentBackThisMonth: (decided.reject ?? 0) + (decided.hold ?? 0),
      decidedToday,
      pendingValue: items.reduce((s, i) => s + i.amount, 0),
      departments,
    },
  };
}
