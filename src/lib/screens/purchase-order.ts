import "server-only";

import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { issueInclude, toIssueRow } from "@/lib/grn";
import { poDisplayNumber } from "@/lib/po-status";
import { termsTransporter } from "@/lib/po-transporter";
import { itemTransport, routeLabel, transportChoices, uniqueNames } from "@/lib/transport";
import { loadTransportOptions } from "@/lib/transport-data";
import { getActivePOPdf, getCompany } from "@/lib/purchase-orders";
import { limitBlock } from "@/lib/approval";
import { can, isAdmin, isLead } from "@/lib/roles";
import { loadTimeline } from "@/lib/screens/timeline";
import type { Role } from "@/generated/prisma/enums";

/**
 * A purchase order page: the PO, its PDF, receipts, issues, amendments, documents and history, and
 * what this user may do with it (approval limits, own-PO rules). Null when the PO doesn't exist.
 */
export async function loadPurchaseOrderScreen(poId: number, user: { id: number; roles: Role[]; approvalLimit: number | null }) {

  const [po, company, pdf, activity, receipts, issues, amendments, addresses, documents, transportOptions] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        items: { orderBy: { lineNo: "asc" }, include: { item: { select: { sku: true, preferredTransport: true } } } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { name: true } },
        sentBy: { select: { name: true } },
        indent: { select: { id: true, indentNumber: true, approvedAt: true, approvedBy: { select: { name: true } } } },
      },
    }),
    getCompany(),
    getActivePOPdf(poId),
    db.auditLog.findMany({
      where: { entityType: "purchase_order", entityId: poId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } } },
    }),
    db.goodsReceipt.findMany({
      where: { poId },
      orderBy: { id: "desc" },
      select: { id: true, grnNumber: true, status: true, receivedAt: true, invoiceNo: true, _count: { select: { issues: true } } },
    }),
    db.vendorIssue.findMany({ where: { poId }, orderBy: { raisedAt: "desc" }, include: issueInclude }),
    db.poAmendment.findMany({
      where: { poId },
      orderBy: { revisionNo: "desc" },
      include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
    }),
    listAddresses(),
    db.document.findMany({
      where: { poId, type: { not: "PO_PDF" }, status: "ACTIVE" },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, fileName: true, size: true, grn: { select: { grnNumber: true } } },
    }),
    loadTransportOptions(),
  ]);
  if (!po) return null;
  // For the dispatch dialog: the transporter agreed in the terms (else the city's), and others to pick from.
  const choice = transportChoices(transportOptions, po.vendor, itemTransport(po.items.map((l) => l.item)));
  const agreed = termsTransporter(po.terms);
  const transport = {
    agreed: agreed ?? choice.recommended,
    options: uniqueNames([agreed, ...choice.options]),
    route: routeLabel(transportOptions.settings, choice.city),
  };
  const timeline = await loadTimeline(po.indentId, po.id, user.roles);
  const fallbackAddress = defaultAddressText(addresses, company);

  const displayNumber = poDisplayNumber(po);
  const intra = po.taxMode === "INTRA_STATE";
  const isCreatorOrLead = user.id === po.createdById || isLead(user.roles);
  const ownApprovalBlocked = !isAdmin(user.roles) && po.createdById === user.id;
  const limitNote =
    po.status === "PENDING_APPROVAL" && can(user.roles, "approvePO") && !ownApprovalBlocked ? await limitBlock(user, toNumber(po.grandTotal)) : null;
  const showDiscount = po.items.some((i) => toNumber(i.discountPct) > 0);
  const pendingAmendment = amendments.find((a) => a.status === "PENDING");
  const amendmentLimitNote =
    pendingAmendment && can(user.roles, "approvePO") ? await limitBlock(user, toNumber(pendingAmendment.newTotal)) : null;
  const canDecideAmendment =
    !!pendingAmendment && can(user.roles, "approvePO") && !amendmentLimitNote && (isAdmin(user.roles) || pendingAmendment.requestedById !== user.id);
  const showReceived = receipts.length > 0 || ["PARTIALLY_RECEIVED", "COMPLETED"].includes(po.status);

  const linked = po.quotationId !== null && po.indent !== null;
  const steps = linked
    ? [
        { label: "Vendor approved", at: po.indent!.approvedAt, by: po.indent!.approvedBy?.name ?? null, done: true },
        { label: "PO created", at: po.createdAt, by: po.createdBy.name, done: true },
        { label: "Issued", at: po.poDate, by: po.poNumber, done: !!po.poNumber },
        { label: "Sent to vendor", at: po.sentAt, by: po.sentBy?.name ?? null, done: !!po.sentAt },
      ]
    : [
        { label: "Created", at: po.createdAt, by: po.createdBy.name, done: true },
        { label: "Submitted", at: po.submittedAt, by: po.submittedAt ? po.createdBy.name : null, done: !!po.submittedAt || !!po.approvedAt },
        { label: "Approved", at: po.approvedAt, by: po.approvedBy?.name ?? null, done: !!po.approvedAt },
        { label: "Sent to vendor", at: po.sentAt, by: po.sentBy?.name ?? null, done: !!po.sentAt },
      ];
  const currentStep = steps.findIndex((s) => !s.done);

  // The delete-password hash never leaves the server.
  return { po, company: { ...company, deletePasswordHash: null }, pdf, activity, receipts, issues: issues.map((i) => toIssueRow(i, { showRef: true })), amendments, documents, fallbackAddress, displayNumber, intra, isCreatorOrLead, ownApprovalBlocked, limitNote, showDiscount, pendingAmendment, amendmentLimitNote, canDecideAmendment, showReceived, linked, steps, currentStep, timeline, transport };
}
