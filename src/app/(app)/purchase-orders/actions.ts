"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { POStatus } from "@/generated/prisma/enums";
import { runAction } from "@/lib/action";
import { assertWithinLimit } from "@/lib/approval";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize, type CurrentUser } from "@/lib/dal";
import { can, isAdmin, isLead } from "@/lib/roles";
import { formatDate, formatINR, formatQty, toNumber } from "@/lib/format";
import { GmailNotConnected, sendMail } from "@/lib/mail";
import {
  generateAndStorePOPdf,
  getActivePOPdf,
  getCompany,
  nextPONumber,
  updateDraftPO,
} from "@/lib/purchase-orders";
import { readStoredFile } from "@/lib/storage";
import { applyAmendment, evaluateAmendment, type AmendmentChanges } from "@/lib/po-amendments";
import type { AmendmentInput, POInput } from "@/lib/validation";
import { notify, stepDoers, usersById } from "@/lib/notify";
import { recordVendorRates } from "@/lib/vendor-items";

function refresh(poId?: number) {
  revalidatePath("/purchase-orders");
  revalidatePath("/");
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
}

async function loadPO(id: number) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, status: true, poNumber: true, createdById: true, grandTotal: true, quotationId: true, indentId: true, createdBy: { select: { name: true } } },
  });
  if (!po) throw new ActionError("Purchase order not found.");
  return po;
}

/**
 * Moves a PO between statuses only if it is still in an expected status,
 * so two people acting at once can't both succeed.
 */
async function transition(
  id: number,
  from: POStatus[],
  data: Parameters<typeof db.purchaseOrder.updateMany>[0]["data"],
) {
  const { count } = await db.purchaseOrder.updateMany({ where: { id, status: { in: from } }, data });
  if (count === 0) throw new ActionError("This purchase order was changed by someone else. Refresh and try again.");
}

/** Generates the PO PDF; a failure doesn't undo the approval, it comes back as a message instead. */
async function pdfOrError(id: number, userId: number, message: string): Promise<string | null> {
  try {
    await generateAndStorePOPdf(id, userId);
    return null;
  } catch (error) {
    console.error("PO PDF generation failed", error);
    return message;
  }
}

function canModifyDraft(user: NonNullable<CurrentUser>, createdById: number) {
  return isLead(user.roles) || user.id === createdById;
}

export async function savePurchaseOrder(id: number | null, input: POInput, submit: boolean) {
  return runAction(async () => {
    const user = await authorize("createPO");

    let poId: number;
    let linked = false;
    if (id) {
      const existing = await loadPO(id);
      if (!canModifyDraft(user, existing.createdById)) {
        throw new ActionError("Only the creator or a manager can edit this draft.");
      }
      linked = existing.quotationId !== null;
      poId = (await updateDraftPO(id, input)).id;
    } else {
      // Purchase orders come from approved comparative statements (indent → 3 quotes → approval).
      throw new ActionError("Raise an indent and get the vendor approved; the PO is created from the approved comparison.");
    }

    // POs from an approved comparison are issued directly, without a second approval.
    if (submit && !linked) {
      await transition(poId, ["DRAFT"], { status: "PENDING_APPROVAL", submittedAt: new Date() });
    }

    await audit({
      userId: user.id,
      action: submit ? "submit" : id ? "update" : "create",
      entityType: "purchase_order",
      entityId: poId,
      description: submit ? "Submitted for approval" : id ? "Draft updated" : "Draft created",
    });
    refresh(poId);
    return { id: poId };
  });
}

export async function submitForApproval(id: number) {
  return runAction(async () => {
    const user = await authorize("createPO");
    const po = await loadPO(id);
    if (!canModifyDraft(user, po.createdById)) throw new ActionError("Only the creator or a manager can submit this PO.");
    if (po.quotationId) throw new ActionError("This PO's vendor was already approved on the comparison. Use “Issue PO”.");
    await transition(id, ["DRAFT"], { status: "PENDING_APPROVAL", submittedAt: new Date() });
    await audit({ userId: user.id, action: "submit", entityType: "purchase_order", entityId: id, description: "Submitted for approval" });
    const total = toNumber(po.grandTotal);
    notify(user, "poSubmitted", () => stepDoers("ST2", (u) => u.approvalLimit === null || Number(u.approvalLimit) >= total), {
      subject: `PO draft #${id}: approve ${formatINR(total)}`,
      lines: [`${user.name} submitted a purchase order for your approval (${formatINR(total)}).`],
      link: `/purchase-orders/${id}?do=approve&from=fms`,
      files: { poId: id },
    });
    refresh(id);
  });
}

export async function approvePurchaseOrder(id: number) {
  return runAction(async () => {
    const user = await authorize("approvePO");
    const po = await loadPO(id);
    if (po.status !== "PENDING_APPROVAL") throw new ActionError("Only POs pending approval can be approved.");
    if (!isAdmin(user.roles) && po.createdById === user.id) {
      throw new ActionError("You can't approve a PO you created. Ask another manager or an admin.");
    }
    await assertWithinLimit(user, toNumber(po.grandTotal));

    const company = await getCompany();
    const now = new Date();
    const poNumber = await db.$transaction(async (tx) => {
      // The sender (for the initials in the number) is the purchase person who made the PO.
      const number = await nextPONumber(tx, company, po.createdBy.name, now);
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", poNumber: number, poDate: now, approvedById: user.id, approvedAt: now },
      });
      // Rolling back also releases the reserved number, so issued numbers stay gapless.
      if (count === 0) throw new ActionError("This purchase order was changed by someone else. Refresh and try again.");
      return number;
    });

    const [, , pdfError] = await Promise.all([
      audit({
        userId: user.id,
        action: "approve",
        entityType: "purchase_order",
        entityId: id,
        description: `Approved and issued ${poNumber} for ${formatINR(po.grandTotal)}`,
      }),
      recordPORates(id).catch((error) => console.error("Recording vendor rates failed", error)),
      pdfOrError(id, user.id, "PO approved, but the PDF could not be generated. Use “Generate PDF” to retry."),
    ]);

    refresh(id);
    return { poNumber, pdfError };
  });
}

/**
 * Issues a PO that was created from an approved comparative statement: assigns the PO number
 * and generates the PDF. The comparison approver is recorded as the PO's approver.
 */
export async function issuePurchaseOrder(id: number) {
  return runAction(async () => {
    const user = await authorize("createPO");
    const po = await loadPO(id);
    if (!po.quotationId || !po.indentId) throw new ActionError("Only POs created from an approved comparison can be issued directly.");
    if (po.status !== "DRAFT") throw new ActionError("This PO has already been issued.");
    if (!canModifyDraft(user, po.createdById)) throw new ActionError("Only the creator or a manager can issue this PO.");
    const indent = await db.indent.findUnique({ where: { id: po.indentId }, select: { status: true, approvedById: true, approvedAt: true, indentNumber: true } });
    if (!indent || indent.status !== "ORDERED" || !indent.approvedById) throw new ActionError("The indent's vendor selection is not approved.");

    const company = await getCompany();
    const now = new Date();
    const poNumber = await db.$transaction(async (tx) => {
      // The sender (for the initials in the number) is the purchase person who made the PO.
      const number = await nextPONumber(tx, company, po.createdBy.name, now);
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "APPROVED", poNumber: number, poDate: now, approvedById: indent.approvedById, approvedAt: indent.approvedAt ?? now },
      });
      if (count === 0) throw new ActionError("This purchase order was changed by someone else. Refresh and try again.");
      return number;
    });

    const [, , pdfError] = await Promise.all([
      audit({
        userId: user.id,
        action: "approve",
        entityType: "purchase_order",
        entityId: id,
        description: `Issued ${poNumber} for ${formatINR(po.grandTotal)} (vendor approved on ${indent.indentNumber})`,
      }),
      recordPORates(id).catch((error) => console.error("Recording vendor rates failed", error)),
      pdfOrError(id, user.id, "PO issued, but the PDF could not be generated. Use “Generate PDF” to retry."),
    ]);
    refresh(id);
    revalidatePath(`/indents/${po.indentId}`);
    return { poNumber, pdfError };
  });
}

const reasonSchema = z.string().trim().min(3, "Please give a short reason").max(500);

export async function rejectPurchaseOrder(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("approvePO");
    const text = reasonSchema.parse(reason);
    await transition(id, ["PENDING_APPROVAL"], { status: "DRAFT", rejectionReason: text, submittedAt: null });
    await audit({ userId: user.id, action: "reject", entityType: "purchase_order", entityId: id, description: `Sent back: ${text}` });
    refresh(id);
  });
}

export async function cancelPurchaseOrder(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("cancelPO");
    const text = reasonSchema.parse(reason);
    await transition(id, ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED"], {
      status: "CANCELLED",
      cancelReason: text,
      cancelledAt: new Date(),
    });
    await audit({ userId: user.id, action: "cancel", entityType: "purchase_order", entityId: id, description: `Cancelled: ${text}` });
    refresh(id);
  });
}

export async function deleteDraftPurchaseOrder(id: number) {
  return runAction(async () => {
    const user = await authorize("createPO");
    const po = await loadPO(id);
    if (po.status !== "DRAFT" || po.poNumber) throw new ActionError("Only unissued drafts can be deleted.");
    if (po.quotationId) throw new ActionError("This PO comes from an approved indent. Cancel it instead so the record is kept.");
    if (!canModifyDraft(user, po.createdById)) throw new ActionError("Only the creator or a manager can delete this draft.");
    await db.purchaseOrder.delete({ where: { id } });
    await audit({ userId: user.id, action: "delete", entityType: "purchase_order", entityId: id, description: "Draft deleted" });
    refresh();
  });
}

export async function generatePurchaseOrderPdf(id: number) {
  return runAction(async () => {
    const user = await authorize("approvePO");
    const po = await loadPO(id);
    if (!po.poNumber) throw new ActionError("The PDF is generated once the PO is approved.");
    const doc = await generateAndStorePOPdf(id, user.id);
    await audit({ userId: user.id, action: "pdf", entityType: "purchase_order", entityId: id, description: `Generated PDF v${doc.version}` });
    refresh(id);
  });
}

const emailSchema = z.object({
  to: z.array(z.email("Enter valid recipient emails")).min(1, "Add at least one recipient").max(10),
  cc: z.array(z.email("Enter valid CC emails")).max(10),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export async function emailPurchaseOrder(id: number, input: z.input<typeof emailSchema>) {
  return runAction(async () => {
    const user = await authorize("sendPO");
    const { to, cc, subject, message } = emailSchema.parse(input);
    if (!user.gmailConnected) throw new ActionError("Connect your Gmail first, so the PO goes out from your own email address.");

    const po = await loadPO(id);
    if (!po.poNumber || !["APPROVED", "SENT", "ACKNOWLEDGED"].includes(po.status)) {
      throw new ActionError("Only approved purchase orders can be emailed.");
    }

    const doc = (await getActivePOPdf(id)) ?? (await generateAndStorePOPdf(id, user.id));
    const file = await readStoredFile(doc.storagePath);

    // Sent from the user's own mailbox (it appears in their Sent folder).
    try {
      await sendMail(user, { to, cc, subject, text: message, attachments: [{ filename: doc.fileName, content: file, contentType: "application/pdf" }] });
    } catch (error) {
      if (error instanceof GmailNotConnected) throw new ActionError(error.message);
      throw error;
    }

    // Status changes only after Gmail accepted the message.
    const sentAt = new Date();
    await db.purchaseOrder.update({
      where: { id },
      data: {
        status: po.status === "APPROVED" ? "SENT" : po.status,
        sentAt,
        sentById: user.id,
        sentTo: to.join(", "),
      },
    });
    await audit({
      userId: user.id,
      action: "email",
      entityType: "purchase_order",
      entityId: id,
      description: `Emailed to ${to.join(", ")}`,
      data: { to, cc, subject, documentId: doc.id },
    });
    refresh(id);
  });
}

export async function markPurchaseOrderSent(id: number, note: string) {
  return runAction(async () => {
    const user = await authorize("sendPO");
    const text = z.string().trim().min(2, "Say how it was sent, e.g. WhatsApp or by hand").max(200).parse(note);
    await transition(id, ["APPROVED"], { status: "SENT", sentAt: new Date(), sentById: user.id, sentTo: text });
    await audit({ userId: user.id, action: "send", entityType: "purchase_order", entityId: id, description: `Marked as sent (${text})` });
    refresh(id);
  });
}

/** FMS ST3: the vendor confirmed the PO and committed a dispatch date (lead time). */
export async function markPurchaseOrderAcknowledged(id: number, dispatchDate: string) {
  return runAction(async () => {
    const user = await authorize("sendPO");
    const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the dispatch date the vendor confirmed").parse(dispatchDate);
    const po = await loadPO(id);
    if (!["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new ActionError("Send the PO to the vendor first.");
    await transition(id, [po.status], {
      status: po.status === "SENT" ? "ACKNOWLEDGED" : po.status,
      acknowledgedAt: new Date(),
      expectedDispatchDate: new Date(date),
    });
    await audit({ userId: user.id, action: "acknowledge", entityType: "purchase_order", entityId: id, description: `Vendor confirmed the PO; dispatch by ${formatDate(date)}` });
    refresh(id);
  });
}

/** FMS ST4: follow-up call/email with the vendor ahead of the dispatch date. */
export async function recordFollowUp(id: number, note: string) {
  return runAction(async () => {
    const user = await authorize("sendPO");
    const text = z.string().trim().min(3, "Note what the vendor said").max(500).parse(note);
    await transition(id, ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"], { followUpAt: new Date(), followUpNote: text });
    await audit({ userId: user.id, action: "follow_up", entityType: "purchase_order", entityId: id, description: `Followed up with vendor: ${text}` });
    refresh(id);
  });
}

const dispatchSchema = z.object({
  dispatchedOn: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the dispatch date"),
  biltyNo: z.string().trim().min(1, "Enter the bilty / LR number").max(60),
  transporter: z.string().trim().max(120).optional().transform((v) => v || null),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

/** FMS ST4 done: vendor dispatched the material and shared the bilty. */
export async function markDispatched(id: number, raw: z.input<typeof dispatchSchema>) {
  return runAction(async () => {
    const user = await authorize("sendPO");
    const input = dispatchSchema.parse(raw);
    await transition(id, ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"], {
      dispatchedAt: new Date(input.dispatchedOn),
      dispatchBiltyNo: input.biltyNo,
      dispatchTransporter: input.transporter,
      dispatchNote: input.note,
    });
    await audit({
      userId: user.id,
      action: "dispatch",
      entityType: "purchase_order",
      entityId: id,
      description: `Vendor dispatched on ${formatDate(input.dispatchedOn)}, bilty ${input.biltyNo}${input.transporter ? ` (${input.transporter})` : ""}`,
    });
    notify(user, "dispatched", () => stepDoers("ST5"), async () => {
      const po = await db.purchaseOrder.findUniqueOrThrow({
        where: { id },
        select: { poNumber: true, expectedDeliveryDate: true, vendor: { select: { name: true } }, items: { select: { description: true, quantity: true, uom: true } } },
      });
      return {
        subject: `${po.poNumber}: material dispatched by ${po.vendor.name}`,
        lines: [
          `${po.vendor.name} dispatched ${po.poNumber} on ${formatDate(input.dispatchedOn)} — bilty/LR ${input.biltyNo}${input.transporter ? ` via ${input.transporter}` : ""}.`,
          po.expectedDeliveryDate ? `Expected at the store by ${formatDate(po.expectedDeliveryDate)}.` : "",
          "",
          ...po.items.slice(0, 10).map((i) => `  • ${i.description} — ${toNumber(i.quantity)} ${i.uom}`),
        ].filter((l, i) => l !== "" || i > 0),
        link: `/goods-receipts/new?po=${id}&from=fms`,
        files: { poId: id },
      };
    });
    refresh(id);
  });
}

/**
 * Closes a partly delivered PO when the balance won't be supplied, so the pending quantity
 * stops counting as "on order". Material already received stays as recorded on its GRNs.
 */
export async function shortClosePurchaseOrder(id: number, reason: string) {
  return runAction(async () => {
    // Whoever receives the material (the ST5 doer) can close the balance, as can managers.
    const user = await authorize();
    if (!can(user.roles, "cancelPO") && !can(user.roles, "receiveGoods")) throw new ActionError("You don't have permission to do that.");
    const text = reasonSchema.parse(reason);
    const pendingQc = await db.goodsReceipt.findFirst({ where: { poId: id, status: "PENDING_QC" }, select: { grnNumber: true } });
    if (pendingQc) throw new ActionError(`Finish the check of ${pendingQc.grnNumber} before closing this PO, so the accepted quantity is known.`);
    const lines = await db.poItem.findMany({ where: { poId: id }, orderBy: { lineNo: "asc" }, select: { description: true, uom: true, quantity: true, quantityReceived: true } });
    const short = lines
      .map((l) => ({ ...l, short: toNumber(l.quantity) - toNumber(l.quantityReceived) }))
      .filter((l) => l.short > 0)
      .map((l) => `${l.description} ${formatQty(l.short)} ${l.uom}`);
    await transition(id, ["PARTIALLY_RECEIVED", "SENT", "ACKNOWLEDGED", "APPROVED"], {
      status: "COMPLETED",
      shortClosedAt: new Date(),
      shortCloseReason: text,
    });
    await audit({
      userId: user.id,
      action: "close",
      entityType: "purchase_order",
      entityId: id,
      description: `Short closed: ${text}${short.length ? ` (short: ${short.join(", ").slice(0, 300)})` : ""}`,
    });
    refresh(id);
    revalidatePath("/stock");
    revalidatePath("/goods-receipts");
  });
}

/**
 * Reopens a short-closed PO when the balance turns up after all (e.g. POs closed while importing
 * the FMS sheet): back to "partially received" (or sent, if nothing was received), so the rest can
 * be received against it.
 */
export async function reopenPurchaseOrder(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("cancelPO");
    const text = reasonSchema.parse(reason);
    const po = await db.purchaseOrder.findUnique({ where: { id }, select: { status: true, shortClosedAt: true, sentAt: true, items: { select: { quantityReceived: true } } } });
    if (!po || po.status !== "COMPLETED" || !po.shortClosedAt) throw new ActionError("Only a short-closed purchase order can be reopened.");
    const received = po.items.some((l) => toNumber(l.quantityReceived) > 0);
    await transition(id, ["COMPLETED"], {
      status: received ? "PARTIALLY_RECEIVED" : po.sentAt ? "SENT" : "APPROVED",
      shortClosedAt: null,
      shortCloseReason: null,
    });
    await audit({ userId: user.id, action: "reopen", entityType: "purchase_order", entityId: id, description: `Reopened after short close: ${text}` });
    refresh(id);
    revalidatePath("/stock");
    revalidatePath("/goods-receipts");
  });
}

/** Issued PO rates become each vendor's current rate for those items. */
async function recordPORates(id: number) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    select: { vendorId: true, poDate: true, items: { select: { itemId: true, rate: true, discountPct: true } } },
  });
  if (!po) return;
  await db.$transaction((tx) =>
    recordVendorRates(
      tx,
      po.items.map((l) => ({
        vendorId: po.vendorId,
        itemId: l.itemId,
        rate: toNumber(l.rate),
        discountPct: toNumber(l.discountPct),
        source: "PO" as const,
        date: po.poDate ?? new Date(),
      })),
    ),
  );
}

// ── Amendments ──────────────────────────────────────────────────────────────

/** Proposes a revision to an issued PO. It takes effect only after approval. */
export async function requestAmendment(id: number, raw: AmendmentInput) {
  return runAction(async () => {
    const user = await authorize("amendPO");
    const pending = await db.poAmendment.count({ where: { poId: id, status: "PENDING" } });
    if (pending) throw new ActionError("An amendment is already waiting for approval. Approve, send back or withdraw it first.");
    const a = await evaluateAmendment(id, raw);
    const amendment = await db.poAmendment.create({
      data: {
        poId: id,
        revisionNo: a.po.revision + 1,
        reason: a.reason,
        changes: a.changes,
        summary: a.summary,
        oldTotal: a.oldTotal,
        newTotal: a.newTotal,
        requestedById: user.id,
      },
      select: { id: true, revisionNo: true },
    });
    await audit({
      userId: user.id,
      action: "amend",
      entityType: "purchase_order",
      entityId: id,
      description: `Amendment Rev. ${amendment.revisionNo} requested: ${a.summary.join("; ").slice(0, 300)}`,
      data: { amendmentId: amendment.id },
    });
    notify(user, "amendmentRequested", () => stepDoers("ST2", (u) => u.approvalLimit === null || Number(u.approvalLimit) >= a.newTotal), {
      subject: `${a.po.poNumber} Rev. ${amendment.revisionNo}: approve amendment`,
      lines: [
        `${user.name} wants to amend ${a.po.poNumber} (${formatINR(a.oldTotal)} → ${formatINR(a.newTotal)}).`,
        `Reason: ${a.reason}`,
        "",
        ...a.summary.map((x) => `  • ${x}`),
      ],
      link: `/purchase-orders/${id}`,
      files: { poId: id },
    });
    refresh(id);
    return { revisionNo: amendment.revisionNo };
  });
}

async function loadPendingAmendment(amendmentId: number) {
  const amendment = await db.poAmendment.findUnique({
    where: { id: amendmentId },
    include: { po: { select: { id: true, status: true, revision: true, taxMode: true, vendorId: true, poNumber: true } } },
  });
  if (!amendment) throw new ActionError("Amendment not found.");
  if (amendment.status !== "PENDING") throw new ActionError("This amendment has already been decided.");
  return amendment;
}

export async function approveAmendment(amendmentId: number, note: string) {
  return runAction(async () => {
    const user = await authorize("approvePO");
    const amendment = await loadPendingAmendment(amendmentId);
    if (!isAdmin(user.roles) && amendment.requestedById === user.id) {
      throw new ActionError("You requested this amendment, so another manager or an admin must approve it.");
    }
    await assertWithinLimit(user, toNumber(amendment.newTotal));
    // Re-check against the PO as it is now (material may have been received since the request).
    const fresh = await evaluateAmendment(amendment.poId, {
      reason: amendment.reason,
      ...(amendment.changes as unknown as AmendmentChanges),
    });
    if (fresh.po.revision + 1 !== amendment.revisionNo) throw new ActionError("The PO was revised since this request. Ask for a new amendment.");

    await db.$transaction(async (tx) => {
      const { count } = await tx.poAmendment.updateMany({
        where: { id: amendmentId, status: "PENDING" },
        data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), decisionNote: note.trim().slice(0, 500) || null },
      });
      if (!count) throw new ActionError("This amendment was changed by someone else. Refresh and try again.");
      await applyAmendment(tx, fresh.po, fresh.changes);
    });

    await audit({
      userId: user.id,
      action: "approve",
      entityType: "purchase_order",
      entityId: amendment.poId,
      description: `Amendment Rev. ${amendment.revisionNo} approved (${formatINR(amendment.oldTotal)} → ${formatINR(fresh.newTotal)})`,
    });
    notify(user, "amendmentApproved", () => usersById([amendment.requestedById]), {
      subject: `${amendment.po.poNumber} Rev. ${amendment.revisionNo} approved — send the revised PO`,
      lines: [`${user.name} approved amendment Rev. ${amendment.revisionNo}. The revised PDF is ready; please send it to the vendor.`],
      link: `/purchase-orders/${amendment.poId}?do=send&from=fms`,
      files: { poId: amendment.poId },
    });
    const [, pdfError] = await Promise.all([
      recordPORates(amendment.poId).catch((error) => console.error("Recording vendor rates failed", error)),
      pdfOrError(amendment.poId, user.id, "Amendment approved, but the PDF could not be regenerated. Use “Regenerate PDF”."),
    ]);
    refresh(amendment.poId);
    return { pdfError };
  });
}

export async function rejectAmendment(amendmentId: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("approvePO");
    const text = reasonSchema.parse(reason);
    const amendment = await loadPendingAmendment(amendmentId);
    await db.poAmendment.update({
      where: { id: amendmentId },
      data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: text },
    });
    await audit({ userId: user.id, action: "reject", entityType: "purchase_order", entityId: amendment.poId, description: `Amendment Rev. ${amendment.revisionNo} sent back: ${text}` });
    notify(user, "amendmentSentBack", () => usersById([amendment.requestedById]), {
      subject: `${amendment.po.poNumber} Rev. ${amendment.revisionNo} sent back`,
      lines: [`${user.name} sent back amendment Rev. ${amendment.revisionNo}:`, `“${text}”`],
      link: `/purchase-orders/${amendment.poId}`,
    });
    refresh(amendment.poId);
  });
}

export async function withdrawAmendment(amendmentId: number) {
  return runAction(async () => {
    const user = await authorize("amendPO");
    const amendment = await loadPendingAmendment(amendmentId);
    if (amendment.requestedById !== user.id && !isLead(user.roles)) {
      throw new ActionError("Only the requester or a manager can withdraw this amendment.");
    }
    await db.poAmendment.update({ where: { id: amendmentId }, data: { status: "WITHDRAWN", decidedById: user.id, decidedAt: new Date() } });
    await audit({ userId: user.id, action: "withdraw", entityType: "purchase_order", entityId: amendment.poId, description: `Amendment Rev. ${amendment.revisionNo} withdrawn` });
    refresh(amendment.poId);
  });
}