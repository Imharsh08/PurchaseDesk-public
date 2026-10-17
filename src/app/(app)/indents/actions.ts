"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { assertWithinLimit } from "@/lib/approval";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { lineUnit } from "@/lib/item-units";
import { ActionError, authorize, type CurrentUser } from "@/lib/dal";
import { isAdmin, isLead } from "@/lib/roles";
import { buildComparison, createPOsFromIndent, loadIndent, nextIndentNumber } from "@/lib/indents";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { formatDate, formatINR, formatQty, toNumber } from "@/lib/format";
import { GmailNotConnected, sendMail } from "@/lib/mail";
import { notify, stepDoers, usersById } from "@/lib/notify";
import { saveFile } from "@/lib/storage";
import { recordVendorRates } from "@/lib/vendor-items";
import {
  comparisonSchema,
  indentSchema,
  quotationSchema,
  type ComparisonInput,
  type IndentInput,
  type QuotationInput,
} from "@/lib/validation";

function refresh(indentId?: number) {
  revalidatePath("/indents");
  revalidatePath("/quotations");
  revalidatePath("/");
  if (indentId) revalidatePath(`/indents/${indentId}`);
}

const reasonSchema = z.string().trim().min(3, "Please give a short reason").max(500);

async function getIndent(id: number) {
  const indent = await db.indent.findUnique({
    where: { id },
    select: { id: true, status: true, requestedById: true, comparisonSubmittedById: true, indentNumber: true, comparisonValue: true },
  });
  if (!indent) throw new ActionError("Indent not found.");
  return indent;
}

/** Short description of an indent for notification emails. */
async function indentBrief(id: number) {
  const ind = await db.indent.findUniqueOrThrow({
    where: { id },
    select: {
      indentNumber: true,
      priority: true,
      department: true,
      requiredBy: true,
      comparisonValue: true,
      requestedBy: { select: { name: true } },
      items: { orderBy: { lineNo: "asc" }, select: { description: true, quantity: true, uom: true } },
    },
  });
  const urgent = ind.priority === "URGENT" ? "URGENT " : "";
  return {
    ...ind,
    tag: `${urgent}${ind.indentNumber}`,
    itemLines: ind.items.slice(0, 10).map((i) => `  • ${i.description} — ${formatQty(i.quantity)} ${i.uom}`),
    needBy: ind.requiredBy ? `Required by ${formatDate(ind.requiredBy)}` : null,
  };
}

function notifyIndentRaised(user: NonNullable<CurrentUser>, indentId: number) {
  notify(user, "indentRaised", () => stepDoers("ST1"), async () => {
    const b = await indentBrief(indentId);
    return {
      subject: `${b.tag}: get quotations`,
      lines: [`${b.requestedBy.name}${b.department ? ` (${b.department})` : ""} raised ${b.indentNumber}. Please collect at least 3 quotations.`, "", ...b.itemLines, ...(b.needBy ? ["", b.needBy] : [])],
      link: `/indents/${indentId}?from=fms#quotations`,
    };
  });
}

function isOwnerOrLead(user: NonNullable<CurrentUser>, ownerId: number) {
  return user.id === ownerId || isLead(user.roles);
}

// ── Indent ──────────────────────────────────────────────────────────────────

export async function saveIndent(id: number | null, raw: IndentInput, submit: boolean) {
  return runAction(async () => {
    const user = await authorize("raiseIndent");
    const input = indentSchema.parse(raw);

    const items = await db.item.findMany({ where: { id: { in: input.items.map((l) => l.itemId) } }, include: { units: { select: { unit: true, factor: true } } } });
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const lines = input.items.map((l, i) => {
      const item = itemMap.get(l.itemId);
      if (!item) throw new ActionError(`Line ${i + 1}: item not found.`);
      return {
        lineNo: i + 1,
        itemId: item.id,
        description: l.description,
        uom: lineUnit(item, l.uom, i + 1),
        quantity: l.quantity,
        currentStock: l.currentStock,
        remarks: l.remarks,
      };
    });
    const header = {
      department: input.department ?? user.department ?? null,
      priority: input.priority,
      requiredBy: input.requiredBy ? new Date(input.requiredBy) : null,
      purpose: input.purpose,
    };

    const indentId = await db.$transaction(async (tx) => {
      if (id) {
        const existing = await tx.indent.findUnique({ where: { id }, select: { status: true, requestedById: true } });
        if (!existing) throw new ActionError("Indent not found.");
        if (existing.status !== "DRAFT") throw new ActionError("Only draft indents can be edited.");
        if (!isOwnerOrLead(user, existing.requestedById)) throw new ActionError("Only the requester or a manager can edit this indent.");
        await tx.indentItem.deleteMany({ where: { indentId: id } });
        await tx.indent.update({
          where: { id },
          data: { ...header, ...(submit ? { status: "OPEN", submittedAt: new Date() } : {}), items: { create: lines } },
        });
        return id;
      }
      const created = await tx.indent.create({
        data: {
          ...header,
          indentNumber: await nextIndentNumber(tx),
          requestedById: user.id,
          ...(submit ? { status: "OPEN", submittedAt: new Date() } : {}),
          items: { create: lines },
        },
        select: { id: true },
      });
      return created.id;
    });

    await audit({
      userId: user.id,
      action: submit ? "submit" : id ? "update" : "create",
      entityType: "indent",
      entityId: indentId,
      description: submit ? "Indent raised and sent to purchase" : id ? "Draft indent updated" : "Draft indent created",
    });
    if (submit) notifyIndentRaised(user, indentId);
    refresh(indentId);
    return { id: indentId };
  });
}

export async function submitIndent(id: number) {
  return runAction(async () => {
    const user = await authorize("raiseIndent");
    const indent = await getIndent(id);
    if (!isOwnerOrLead(user, indent.requestedById)) throw new ActionError("Only the requester or a manager can submit this indent.");
    const { count } = await db.indent.updateMany({ where: { id, status: "DRAFT" }, data: { status: "OPEN", submittedAt: new Date() } });
    if (!count) throw new ActionError("Only draft indents can be submitted.");
    await audit({ userId: user.id, action: "submit", entityType: "indent", entityId: id, description: "Indent raised and sent to purchase" });
    notifyIndentRaised(user, id);
    refresh(id);
  });
}

export async function cancelIndent(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("raiseIndent");
    const text = reasonSchema.parse(reason);
    const indent = await getIndent(id);
    if (!isOwnerOrLead(user, indent.requestedById)) throw new ActionError("Only the requester or a manager can cancel this indent.");
    const { count } = await db.indent.updateMany({
      where: { id, status: { in: ["DRAFT", "OPEN", "PENDING_APPROVAL", "APPROVED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: text },
    });
    if (!count) throw new ActionError("This indent can no longer be cancelled.");
    await audit({ userId: user.id, action: "cancel", entityType: "indent", entityId: id, description: `Cancelled: ${text}` });
    refresh(id);
  });
}

// ── Quotations ──────────────────────────────────────────────────────────────

async function assertCollecting(indentId: number) {
  const indent = await getIndent(indentId);
  if (indent.status !== "OPEN") {
    throw new ActionError("Quotations can only be changed while the indent is collecting quotes.");
  }
  return indent;
}

export async function saveQuotation(indentId: number, quotationId: number | null, raw: QuotationInput) {
  return runAction(async () => {
    const user = await authorize("manageQuotations");
    await assertCollecting(indentId);
    const input = quotationSchema.parse(raw);

    const [vendor, indentItems] = await Promise.all([
      db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true, name: true, active: true } }),
      db.indentItem.findMany({ where: { indentId }, select: { id: true } }),
    ]);
    if (!vendor) throw new ActionError("Vendor not found.");
    if (!vendor.active) throw new ActionError(`${vendor.name} is inactive.`);
    const valid = new Set(indentItems.map((i) => i.id));

    const lines = input.items
      .filter((l) => l.rate !== null)
      .map((l) => {
        if (!valid.has(l.indentItemId)) throw new ActionError("A line does not belong to this indent.");
        return { indentItemId: l.indentItemId, rate: l.rate!, discountPct: l.discountPct, gstRate: l.gstRate, remarks: l.remarks };
      });

    const header = {
      vendorId: vendor.id,
      vendorRef: input.vendorRef,
      quoteDate: input.quoteDate ? new Date(input.quoteDate) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      deliveryDays: input.deliveryDays,
      paymentTerms: input.paymentTerms,
      creditDays: input.creditDays,
      earlyDiscountPct: input.earlyDiscountPct,
      // A freight amount means freight is extra; "included" carries no amount.
      freightTerms: input.otherCharges > 0 ? "EXTRA" : input.freightTerms,
      otherCharges: input.freightTerms === "INCLUDED" ? 0 : input.otherCharges,
      notes: input.notes,
    };

    const id = await db.$transaction(async (tx) => {
      if (quotationId) {
        const existing = await tx.quotation.findUnique({ where: { id: quotationId }, select: { indentId: true } });
        if (!existing || existing.indentId !== indentId) throw new ActionError("Quotation not found.");
        await tx.quotationItem.deleteMany({ where: { quotationId } });
        await tx.quotation.update({ where: { id: quotationId }, data: { ...header, items: { create: lines } } });
        return quotationId;
      }
      const created = await tx.quotation.create({
        data: { ...header, indentId, createdById: user.id, items: { create: lines } },
        select: { id: true },
      });
      return created.id;
    });

    // Quoted rates link the vendor to these items and update its current rate.
    const lineItems = await db.indentItem.findMany({ where: { id: { in: lines.map((l) => l.indentItemId) } }, select: { id: true, itemId: true } });
    const itemOf = new Map(lineItems.map((l) => [l.id, l.itemId]));
    await db
      .$transaction((tx) =>
        recordVendorRates(
          tx,
          lines.map((l) => ({
            vendorId: vendor.id,
            itemId: itemOf.get(l.indentItemId)!,
            rate: l.rate,
            discountPct: l.discountPct,
            source: "QUOTATION" as const,
            date: header.quoteDate ?? new Date(),
          })),
        ),
      )
      .catch((error) => console.error("Recording vendor rates failed", error));

    await audit({
      userId: user.id,
      action: quotationId ? "update" : "create",
      entityType: "indent",
      entityId: indentId,
      description: `${quotationId ? "Updated" : "Added"} quotation from ${vendor.name}`,
    });
    refresh(indentId);
    return { id };
  });
}

export async function deleteQuotation(indentId: number, quotationId: number) {
  return runAction(async () => {
    const user = await authorize("manageQuotations");
    await assertCollecting(indentId);
    const q = await db.quotation.findUnique({ where: { id: quotationId }, include: { vendor: { select: { name: true } } } });
    if (!q || q.indentId !== indentId) throw new ActionError("Quotation not found.");
    await db.quotation.delete({ where: { id: quotationId } });
    await audit({ userId: user.id, action: "delete", entityType: "indent", entityId: indentId, description: `Removed quotation from ${q.vendor.name}` });
    refresh(indentId);
  });
}

const FILE_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

export async function uploadQuotationFile(quotationId: number, formData: FormData) {
  return runAction(async () => {
    const user = await authorize("manageQuotations");
    const q = await db.quotation.findUnique({ where: { id: quotationId }, select: { indentId: true } });
    if (!q) throw new ActionError("Quotation not found.");
    await assertCollecting(q.indentId);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a file to upload.");
    const ext = FILE_TYPES[file.type];
    if (!ext) throw new ActionError("Attach the quotation as a PDF, PNG or JPG.");
    if (file.size > 5 * 1024 * 1024) throw new ActionError("The file must be smaller than 5 MB.");
    const stored = await saveFile(
      `quotations/${q.indentId}/${quotationId}-${Date.now()}.${ext}`,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    await db.quotation.update({
      where: { id: quotationId },
      data: { attachmentPath: stored.storagePath, attachmentName: file.name.slice(0, 200) },
    });
    await audit({ userId: user.id, action: "update", entityType: "indent", entityId: q.indentId, description: "Attached quotation document" });
    refresh(q.indentId);
  });
}

// ── Comparative statement & approval ────────────────────────────────────────

export async function submitComparison(indentId: number, raw: ComparisonInput) {
  return runAction(async () => {
    const user = await authorize("manageQuotations");
    const input = comparisonSchema.parse(raw);
    const indent = await loadIndent(indentId);
    if (!indent) throw new ActionError("Indent not found.");
    if (indent.status !== "OPEN") throw new ActionError("This indent is not collecting quotes.");

    const quoteCount = indent.quotations.length;
    if (quoteCount === 0) throw new ActionError("Add at least one quotation first.");
    if (quoteCount < MIN_QUOTATIONS && (input.justification ?? "").length < 10) {
      throw new ActionError(
        `Only ${quoteCount} quotation${quoteCount === 1 ? "" : "s"} received. Explain why fewer than ${MIN_QUOTATIONS} (at least 10 characters).`,
      );
    }

    const { lines, vendors } = await buildComparison(indent);
    const chosen = new Map(input.selections.map((s) => [s.indentItemId, s]));
    const updates = lines.map((line) => {
      const pick = chosen.get(line.indentItemId);
      if (!pick) throw new ActionError(`Choose a vendor for line ${line.lineNo}.`);
      const offer = line.offers.find((o) => o.quoteItemId === pick.quoteItemId);
      if (!offer) throw new ActionError(`Line ${line.lineNo}: the chosen quote is not valid for this item.`);
      if (!offer.recommended && (pick.reason ?? "").length < 3) {
        throw new ActionError(`Line ${line.lineNo}: give a reason for not choosing the recommended vendor.`);
      }
      return {
        id: line.indentItemId,
        quoteItemId: pick.quoteItemId,
        reason: offer.recommended ? null : pick.reason,
        quotationId: offer.quotationId,
        valueInclGst: offer.amount * (1 + offer.gstRate / 100),
      };
    });
    // Approval value: selected lines incl. GST, plus freight/other charges of the vendors chosen.
    const chosenQuotes = new Set(updates.map((u) => u.quotationId));
    const comparisonValue =
      Math.round(
        (updates.reduce((s, u) => s + u.valueInclGst, 0) +
          vendors.filter((v) => chosenQuotes.has(v.quotationId)).reduce((s, v) => s + v.otherCharges, 0)) *
          100,
      ) / 100;

    await db.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.indentItem.update({ where: { id: u.id }, data: { selectedQuoteItemId: u.quoteItemId, selectionReason: u.reason } });
      }
      const { count } = await tx.indent.updateMany({
        where: { id: indentId, status: "OPEN" },
        data: {
          status: "PENDING_APPROVAL",
          comparisonSubmittedById: user.id,
          comparisonSubmittedAt: new Date(),
          quoteJustification: quoteCount < MIN_QUOTATIONS ? input.justification : null,
          comparisonValue,
          rejectionReason: null,
        },
      });
      if (!count) throw new ActionError("This indent was changed by someone else. Refresh and try again.");
    });

    await audit({
      userId: user.id,
      action: "submit",
      entityType: "indent",
      entityId: indentId,
      description: `Comparative statement (${quoteCount} quotation${quoteCount === 1 ? "" : "s"}) submitted for approval`,
    });
    // Approvers whose limit covers the selection value.
    notify(
      user,
      "comparisonSubmitted",
      () => stepDoers("ST2", (u) => u.approvalLimit === null || Number(u.approvalLimit) >= comparisonValue),
      async () => {
        const b = await indentBrief(indentId);
        return {
          subject: `${b.tag}: approve vendor selection (${formatINR(comparisonValue)})`,
          lines: [
            `${user.name} compared ${quoteCount} quotation${quoteCount === 1 ? "" : "s"} for ${b.indentNumber} and sent the vendor selection for your approval.`,
            `Value of selection: ${formatINR(comparisonValue)} incl. GST.`,
            ...(quoteCount < MIN_QUOTATIONS ? [`Note: only ${quoteCount} quotation(s) — reason: ${input.justification}`] : []),
            "",
            ...b.itemLines,
          ],
          link: `/indents/${indentId}?from=fms#comparison`,
          files: { indentId },
        };
      },
    );
    refresh(indentId);
  });
}

export async function approveComparison(indentId: number, note: string) {
  return runAction(async () => {
    const user = await authorize("approveComparison");
    const indent = await getIndent(indentId);
    if (indent.status !== "PENDING_APPROVAL") throw new ActionError("Only comparisons pending approval can be approved.");
    await assertWithinLimit(user, toNumber(indent.comparisonValue));
    if (!isAdmin(user.roles) && indent.comparisonSubmittedById === user.id) {
      throw new ActionError("You submitted this comparison, so another manager or an admin must approve it.");
    }
    const text = note.trim().slice(0, 500) || null;
    const { count } = await db.indent.updateMany({
      where: { id: indentId, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), approvalNote: text },
    });
    if (!count) throw new ActionError("This indent was changed by someone else. Refresh and try again.");
    await audit({ userId: user.id, action: "approve", entityType: "indent", entityId: indentId, description: `Vendor selection approved${text ? `: ${text}` : ""}` });
    notify(
      user,
      "comparisonApproved",
      async () => [await stepDoers("ST3"), await usersById([indent.requestedById])],
      async () => {
        const b = await indentBrief(indentId);
        return {
          subject: `${b.tag}: vendor approved — create & send the PO`,
          lines: [`${user.name} approved the vendor selection for ${b.indentNumber}${text ? ` (“${text}”)` : ""}. Purchase can now create, issue and send the PO.`, "", ...b.itemLines],
          link: `/indents/${indentId}?from=fms`,
          files: { indentId },
        };
      },
    );
    refresh(indentId);
  });
}

export async function rejectComparison(indentId: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("approveComparison");
    const text = reasonSchema.parse(reason);
    const { count } = await db.indent.updateMany({
      where: { id: indentId, status: "PENDING_APPROVAL" },
      data: { status: "OPEN", rejectionReason: text },
    });
    if (!count) throw new ActionError("Only comparisons pending approval can be sent back.");
    await audit({ userId: user.id, action: "reject", entityType: "indent", entityId: indentId, description: `Sent back: ${text}` });
    const sub = await db.indent.findUnique({ where: { id: indentId }, select: { comparisonSubmittedById: true, indentNumber: true } });
    notify(user, "comparisonSentBack", () => usersById([sub?.comparisonSubmittedById]), {
      subject: `${sub?.indentNumber}: comparison sent back`,
      lines: [`${user.name} sent the comparative statement for ${sub?.indentNumber} back:`, `“${text}”`],
      link: `/indents/${indentId}#quotations`,
    });
    refresh(indentId);
  });
}

export async function createPurchaseOrders(indentId: number) {
  return runAction(async () => {
    const user = await authorize("createPO");
    const ids = await createPOsFromIndent(indentId, user.id);
    await audit({
      userId: user.id,
      action: "create",
      entityType: "indent",
      entityId: indentId,
      description: `Created ${ids.length} purchase order${ids.length === 1 ? "" : "s"} from the approved comparison`,
    });
    for (const id of ids) {
      await audit({ userId: user.id, action: "create", entityType: "purchase_order", entityId: id, description: "Created from approved comparative statement" });
    }
    refresh(indentId);
    revalidatePath("/purchase-orders");
    return { ids };
  });
}

// ── Request for quotation (RFQ) email to vendors ────────────────────────────

const rfqSchema = z.object({
  vendorIds: z.array(z.coerce.number().int().positive()).min(1, "Choose at least one vendor").max(30),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10, "Write the enquiry").max(8000),
});

/** Emails the enquiry to each selected vendor separately, from the user's own Gmail. */
export async function sendRfq(indentId: number, raw: z.input<typeof rfqSchema>) {
  return runAction(async () => {
    const user = await authorize("manageQuotations");
    const input = rfqSchema.parse(raw);
    if (!user.gmailConnected) throw new ActionError("Connect your Gmail first (profile menu → Connect Gmail).");
    const indent = await assertCollecting(indentId);
    const vendors = await db.vendor.findMany({ where: { id: { in: input.vendorIds }, active: true }, select: { id: true, name: true, email: true, contactPerson: true } });
    const missing = vendors.filter((v) => !v.email);
    if (missing.length) throw new ActionError(`No email saved for ${missing.map((v) => v.name).join(", ")}.`);

    const sent: string[] = [];
    const failed: string[] = [];
    for (const v of vendors) {
      try {
        const greeting = `Dear ${v.contactPerson ?? v.name},`;
        await sendMail(user, { to: [v.email!], subject: input.subject, text: input.message.replace(/^Dear[^\n]*,/, greeting) });
        sent.push(v.name);
      } catch (error) {
        if (error instanceof GmailNotConnected) throw new ActionError(error.message);
        console.error("RFQ email failed", v.name, error);
        failed.push(v.name);
      }
    }
    if (sent.length) {
      await audit({ userId: user.id, action: "rfq", entityType: "indent", entityId: indentId, description: `Quotation request emailed to ${sent.join(", ")}` });
    }
    refresh(indent.id);
    if (!sent.length) throw new ActionError(`Could not send to ${failed.join(", ")}.`);
    return { sent, failed };
  });
}