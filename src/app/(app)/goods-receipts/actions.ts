"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DocumentType, IssueType } from "@/generated/prisma/enums";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";
import { checkDocumentFile, storeGrnDocument } from "@/lib/documents";
import { ActionError, authorize } from "@/lib/dal";
import { formatDate, formatINR, formatQty, toNumber } from "@/lib/format";
import { unitFactor } from "@/lib/units";
import { RECEIVABLE_PO, loadReceivablePO, nextGrnNumber, refreshPOReceiptStatus } from "@/lib/grn";
import { notify, stepDoers, usersWith } from "@/lib/notify";
import { grnSchema, qcSchema, vendorIssueSchema, type QcInput, type VendorIssueInput } from "@/lib/validation";

const UPLOADABLE: DocumentType[] = ["INVOICE", "BILTY", "QUALITY_CERT", "OTHER"];
const DOC_LABEL: Record<string, string> = { INVOICE: "invoice", BILTY: "bilty", QUALITY_CERT: "test certificate", OTHER: "document" };

function refresh(grnId?: number, poId?: number) {
  revalidatePath("/goods-receipts");
  revalidatePath("/");
  if (grnId) revalidatePath(`/goods-receipts/${grnId}`);
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
}

/** Records material received against a PO (step 1). Stock is updated after the quality check. */
export async function createGoodsReceipt(formData: FormData) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("data") ?? "{}"));
    } catch {
      throw new ActionError("The form could not be read. Refresh and try again.");
    }
    const input = grnSchema.parse(raw);
    const files = (["INVOICE", "BILTY"] as const)
      .map((type) => ({ type, file: formData.get(type) }))
      .filter((f): f is { type: "INVOICE" | "BILTY"; file: File } => f.file instanceof File && f.file.size > 0);
    files.forEach((f) => checkDocumentFile(f.file));

    const loaded = await loadReceivablePO(input.poId);
    if (!loaded) throw new ActionError("Purchase order not found.");
    const { po } = loaded;
    if (!RECEIVABLE_PO.includes(po.status)) throw new ActionError("Material can only be received against an issued, open PO.");

    const receivedAt = new Date(input.receivedAt);
    if (receivedAt.getTime() > Date.now() + 86_400_000) throw new ActionError("The receipt date can't be in the future.");

    const byLine = new Map(loaded.lines.map((l) => [l.poItemId, l]));
    const lines = input.items
      .filter((l) => (l.receivedQty ?? 0) > 0)
      .map((l) => {
        const line = byLine.get(l.poItemId);
        if (!line) throw new ActionError("A line does not belong to this purchase order.");
        // Catch typos (e.g. an extra zero); small over-deliveries are allowed and flagged in the check.
        if (l.receivedQty! > Math.max(line.pending, line.ordered) * 2) {
          throw new ActionError(`Line ${line.lineNo}: ${formatQty(l.receivedQty)} ${line.uom} is far more than ordered (${formatQty(line.ordered)}). Check the quantity.`);
        }
        return { poItemId: line.poItemId, itemId: line.itemId, invoiceQty: l.invoiceQty, receivedQty: l.receivedQty! };
      });

    const grn = await db.$transaction(async (tx) => {
      const grnNumber = await nextGrnNumber(tx, receivedAt);
      return tx.goodsReceipt.create({
        data: {
          grnNumber,
          poId: po.id,
          vendorId: po.vendorId,
          receivedAt,
          invoiceNo: input.invoiceNo,
          invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
          invoiceAmount: input.invoiceAmount,
          challanNo: input.challanNo,
          transporter: input.transporter,
          biltyNo: input.biltyNo,
          biltyDate: input.biltyDate ? new Date(input.biltyDate) : null,
          vehicleNo: input.vehicleNo,
          freightAmount: input.freightAmount,
          remarks: input.remarks,
          receivedById: user.id,
          items: { create: lines },
        },
        select: { id: true, grnNumber: true, poId: true },
      });
    });

    let uploadError: string | null = null;
    for (const f of files) {
      try {
        await storeGrnDocument(grn, f.type, f.file, user.id);
      } catch (error) {
        console.error("GRN document upload failed", error);
        uploadError = `${grn.grnNumber} was saved, but the ${DOC_LABEL[f.type]} could not be uploaded. Attach it again from the receipt.`;
      }
    }

    const summary = `${grn.grnNumber}: ${lines.length} item${lines.length === 1 ? "" : "s"} received${input.invoiceNo ? `, invoice ${input.invoiceNo}` : ""}`;
    await audit({ userId: user.id, action: "receive", entityType: "goods_receipt", entityId: grn.id, description: `Material received against ${po.poNumber}` });
    await audit({ userId: user.id, action: "receive", entityType: "purchase_order", entityId: po.id, description: `${summary} (awaiting quality check)` });
    notify(user, "received", () => stepDoers("ST6"), {
      subject: `${grn.grnNumber}: material received — quality & quantity check`,
      lines: [
        `${user.name} received material from ${po.vendor.name} against ${po.poNumber} (${grn.grnNumber}).`,
        `Please do the quantity & quality check so it can go into stock.`,
        "",
        ...lines.map((l) => `  • ${byLine.get(l.poItemId)!.description} — ${formatQty(l.receivedQty)} ${byLine.get(l.poItemId)!.uom}`),
      ],
      link: `/goods-receipts/${grn.id}?from=fms#qc`,
      files: { grnId: grn.id, poId: po.id },
    });
    if (files.some((f) => f.type === "INVOICE") && !uploadError) notifyInvoiceAttached(user, grn.id);
    refresh(grn.id, po.id);
    return { id: grn.id, grnNumber: grn.grnNumber, uploadError };
  });
}

/** An invoice came in on a receipt: accounts get it (off until the admin turns it on). */
function notifyInvoiceAttached(user: { id: number; name: string; email: string; gmailConnected: boolean }, grnId: number) {
  notify(user, "invoiceAttached", () => stepDoers("ST9"), async () => {
    const g = await db.goodsReceipt.findUniqueOrThrow({
      where: { id: grnId },
      select: { grnNumber: true, poId: true, invoiceNo: true, invoiceDate: true, invoiceAmount: true, vendor: { select: { name: true } }, po: { select: { poNumber: true } } },
    });
    return {
      subject: `${g.grnNumber}: invoice${g.invoiceNo ? ` ${g.invoiceNo}` : ""} from ${g.vendor.name}`,
      lines: [
        `${user.name} attached the invoice for ${g.grnNumber} (${g.vendor.name}, ${g.po.poNumber ?? "PO"}).`,
        [g.invoiceNo && `Invoice ${g.invoiceNo}`, g.invoiceDate && `dated ${formatDate(g.invoiceDate)}`, g.invoiceAmount !== null && `for ${formatINR(g.invoiceAmount)}`].filter(Boolean).join(" ") || "",
      ].filter(Boolean),
      link: `/goods-receipts/${grnId}`,
      files: { grnId, poId: g.poId },
    };
  });
}

export async function uploadGrnDocument(grnId: number, type: DocumentType, formData: FormData) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    if (!UPLOADABLE.includes(type)) throw new ActionError("Unknown document type.");
    const grn = await db.goodsReceipt.findUnique({ where: { id: grnId }, select: { id: true, poId: true, status: true, grnNumber: true } });
    if (!grn) throw new ActionError("Goods receipt not found.");
    if (grn.status === "CANCELLED") throw new ActionError("This receipt was cancelled.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a file to upload.");
    checkDocumentFile(file);
    await storeGrnDocument(grn, type, file, user.id);
    await audit({ userId: user.id, action: "upload", entityType: "goods_receipt", entityId: grn.id, description: `Attached ${DOC_LABEL[type]} (${file.name.slice(0, 80)})` });
    if (type === "INVOICE") notifyInvoiceAttached(user, grn.id);
    refresh(grn.id, grn.poId);
  });
}

export async function deleteGrnDocument(documentId: number) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    const doc = await db.document.findUnique({ where: { id: documentId }, select: { id: true, grnId: true, poId: true, fileName: true, type: true } });
    if (!doc?.grnId) throw new ActionError("Document not found.");
    await db.document.update({ where: { id: documentId }, data: { status: "SUPERSEDED" } });
    await audit({ userId: user.id, action: "delete", entityType: "goods_receipt", entityId: doc.grnId, description: `Removed ${DOC_LABEL[doc.type] ?? "document"} (${doc.fileName})` });
    refresh(doc.grnId, doc.poId ?? undefined);
  });
}

/**
 * Quantity & quality check (step 2): accepted quantities go into stock and count as received on
 * the PO; failed checks raise vendor issues so they are tracked against the vendor.
 */
export async function submitQualityCheck(grnId: number, raw: QcInput) {
  return runAction(async () => {
    const user = await authorize("qualityCheck");
    const input = qcSchema.parse(raw);
    const grn = await db.goodsReceipt.findUnique({
      where: { id: grnId },
      include: {
        vendor: { select: { name: true } },
        po: { select: { id: true, poNumber: true } },
        items: { include: { item: { select: { name: true, ...unitItemSelect } }, poItem: { select: { uom: true } } } },
      },
    });
    if (!grn) throw new ActionError("Goods receipt not found.");
    if (grn.status !== "PENDING_QC") throw new ActionError("This receipt has already been checked.");

    const entered = new Map(input.items.map((l) => [l.id, l]));
    if (entered.size !== grn.items.length || grn.items.some((l) => !entered.has(l.id))) {
      throw new ActionError("Check every item on the receipt.");
    }

    const issues: { type: IssueType; itemId: number; description: string; qtyAffected: number | null }[] = [];
    const results = grn.items.map((line) => {
      const e = entered.get(line.id)!;
      const received = toNumber(line.receivedQty);
      const invoiceQty = line.invoiceQty === null ? null : toNumber(line.invoiceQty);
      const name = `${line.item.name}`;
      if (e.acceptedQty > received) throw new ActionError(`${name}: accepted qty can't be more than received (${formatQty(received)}).`);
      const rejected = Math.round((received - e.acceptedQty) * 1000) / 1000;
      if (rejected > 0 && e.qualityCheck === "PASS") {
        throw new ActionError(`${name}: mark the quality check as Fail when rejecting ${formatQty(rejected)} ${line.poItem.uom}.`);
      }
      const note = e.remarks ? ` — ${e.remarks}` : "";
      if (e.qtyCheck === "FAIL") {
        const excess = invoiceQty !== null && received > invoiceQty;
        issues.push({
          type: excess ? "EXCESS_QTY" : "SHORT_QTY",
          itemId: line.itemId,
          qtyAffected: invoiceQty !== null ? Math.abs(invoiceQty - received) : null,
          description:
            invoiceQty !== null
              ? `${name}: received ${formatQty(received)} ${line.poItem.uom} against ${formatQty(invoiceQty)} on the invoice${note}`
              : `${name}: quantity check failed${note}`,
        });
      }
      if (e.qualityCheck === "FAIL") {
        issues.push({
          type: "QUALITY",
          itemId: line.itemId,
          qtyAffected: rejected,
          description:
            rejected > 0
              ? `${name}: ${formatQty(rejected)} ${line.poItem.uom} rejected in quality check${note}`
              : `${name}: quality deviation, accepted${note}`,
        });
      }
      return { line, e, accepted: e.acceptedQty, rejected };
    });

    const now = new Date();
    await db.$transaction(async (tx) => {
      const { count } = await tx.goodsReceipt.updateMany({
        where: { id: grnId, status: "PENDING_QC" },
        data: { status: "COMPLETED", qcById: user.id, qcAt: now, qcRemarks: input.remarks },
      });
      if (!count) throw new ActionError("This receipt was changed by someone else. Refresh and try again.");

      for (const r of results) {
        await tx.goodsReceiptItem.update({
          where: { id: r.line.id },
          data: { qtyCheck: r.e.qtyCheck, qualityCheck: r.e.qualityCheck, acceptedQty: r.accepted, rejectedQty: r.rejected, remarks: r.e.remarks },
        });
        if (r.accepted <= 0) continue;
        await tx.poItem.update({ where: { id: r.line.poItemId }, data: { quantityReceived: { increment: r.accepted } } });
        const item = await tx.item.findUniqueOrThrow({ where: { id: r.line.itemId }, select: { currentStock: true } });
        const before = item.currentStock === null ? null : toNumber(item.currentStock);
        // Stock is kept in the item's own unit; the receipt is in the PO line's (3,000 Kg → 120 Bag).
        // With no conversion set up yet, the quantity is taken as it is.
        const factor = unitFactor(toUnitItem(r.line.item), r.line.poItem.uom) ?? 1;
        const added = Math.round(r.accepted * factor * 1000) / 1000;
        const after = Math.round(((before ?? 0) + added) * 1000) / 1000;
        await tx.item.update({ where: { id: r.line.itemId }, data: { currentStock: after } });
        await tx.stockCount.create({
          data: {
            kind: "RECEIPT",
            itemId: r.line.itemId,
            quantity: after,
            previousQty: before,
            grnId,
            note: `${grn.grnNumber} · ${grn.vendor.name} · +${formatQty(r.accepted)} ${r.line.poItem.uom}`,
            countedById: user.id,
            countedAt: now,
          },
        });
      }

      for (const issue of issues) {
        await tx.vendorIssue.create({
          data: { ...issue, vendorId: grn.vendorId, poId: grn.poId, grnId, raisedById: user.id, raisedAt: now },
        });
      }
      await refreshPOReceiptStatus(tx, grn.poId);
    });

    const accepted = results.filter((r) => r.accepted > 0).length;
    const failed = results.filter((r) => r.e.qtyCheck === "FAIL" || r.e.qualityCheck === "FAIL").length;
    const text = `Checked: ${accepted} item${accepted === 1 ? "" : "s"} accepted into stock${failed ? `, ${failed} failed (${issues.length} issue${issues.length === 1 ? "" : "s"} raised)` : ""}`;
    await audit({ userId: user.id, action: "qc", entityType: "goods_receipt", entityId: grnId, description: text });
    const rejectedLines = results.filter((r) => r.rejected > 0);
    notify(user, "checked", () => stepDoers("ST8"), {
      subject: `${grn.grnNumber}: checked — store the material & update Tally`,
      lines: [`${user.name} completed the check for ${grn.grnNumber} (${grn.vendor.name}).`, text, "", "Please put the accepted material away and enter the receipt in Tally."],
      link: `/goods-receipts/${grnId}?do=store&from=fms`,
      files: { grnId, poId: grn.poId },
    });
    if (rejectedLines.length) {
      notify(user, "rejected", () => stepDoers("ST7"), {
        subject: `${grn.grnNumber}: return rejected material to ${grn.vendor.name}`,
        lines: [
          `Rejected in the check of ${grn.grnNumber}:`,
          ...rejectedLines.map((r) => `  • ${r.line.item.name} — ${formatQty(r.rejected)} ${r.line.poItem.uom}${r.e.remarks ? ` (${r.e.remarks})` : ""}`),
          "",
          "Please return it to the vendor and record the return.",
        ],
        link: `/goods-receipts/${grnId}?do=return&from=fms`,
        files: { grnId, poId: grn.poId },
      });
    }
    if (issues.length) {
      notify(user, "vendorIssue", () => usersWith("resolveIssue"), {
        subject: `${grn.vendor.name}: ${issues.length} issue${issues.length === 1 ? "" : "s"} on ${grn.grnNumber}`,
        lines: [`Vendor issues raised from the check of ${grn.grnNumber} (${grn.po.poNumber}):`, ...issues.map((i) => `  • ${i.description}`), "", "Please take it up with the vendor (replacement / debit note)."],
        link: `/goods-receipts/${grnId}`,
        files: { grnId, poId: grn.poId },
      });
    }
    await audit({ userId: user.id, action: "receive", entityType: "purchase_order", entityId: grn.poId, description: `${grn.grnNumber} ${text.charAt(0).toLowerCase()}${text.slice(1)}` });
    refresh(grnId, grn.poId);
    revalidatePath("/stock");
    revalidatePath(`/vendors/${grn.vendorId}`);
    return { issues: issues.length };
  });
}

const reasonSchema = z.string().trim().min(3, "Please give a short reason").max(500);

export async function cancelGoodsReceipt(grnId: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    const text = reasonSchema.parse(reason);
    const grn = await db.goodsReceipt.findUnique({ where: { id: grnId }, select: { poId: true, grnNumber: true } });
    if (!grn) throw new ActionError("Goods receipt not found.");
    const { count } = await db.goodsReceipt.updateMany({
      where: { id: grnId, status: "PENDING_QC" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: text },
    });
    if (!count) throw new ActionError("Only receipts awaiting the quality check can be cancelled.");
    await audit({ userId: user.id, action: "cancel", entityType: "goods_receipt", entityId: grnId, description: `Cancelled: ${text}` });
    await audit({ userId: user.id, action: "cancel", entityType: "purchase_order", entityId: grn.poId, description: `${grn.grnNumber} cancelled: ${text}` });
    refresh(grnId, grn.poId);
  });
}

// ── FMS steps after the check: return rejected material (ST7), store & Tally (ST8) ──

export async function recordReturn(grnId: number, note: string) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    const text = z.string().trim().min(3, "Give the return challan / gate pass no. and transporter").max(500).parse(note);
    const grn = await db.goodsReceipt.findUnique({
      where: { id: grnId },
      select: { status: true, poId: true, grnNumber: true, returnedAt: true, items: { select: { rejectedQty: true } } },
    });
    if (!grn) throw new ActionError("Goods receipt not found.");
    if (grn.status !== "COMPLETED") throw new ActionError("Return is recorded after the quality check.");
    if (!grn.items.some((l) => toNumber(l.rejectedQty) > 0)) throw new ActionError("Nothing was rejected on this receipt.");
    if (grn.returnedAt) throw new ActionError("The return is already recorded.");
    await db.goodsReceipt.update({ where: { id: grnId }, data: { returnedAt: new Date(), returnNote: text, returnedById: user.id } });
    await audit({ userId: user.id, action: "return", entityType: "goods_receipt", entityId: grnId, description: `Rejected material returned to vendor: ${text}` });
    await audit({ userId: user.id, action: "return", entityType: "purchase_order", entityId: grn.poId, description: `${grn.grnNumber}: rejected material returned (${text})` });
    refresh(grnId, grn.poId);
  });
}

export async function markStored(grnId: number, tallyRef: string) {
  return runAction(async () => {
    const user = await authorize("receiveGoods");
    const ref = tallyRef.trim().slice(0, 60) || null;
    const grn = await db.goodsReceipt.findUnique({ where: { id: grnId }, select: { status: true, poId: true, storedAt: true } });
    if (!grn) throw new ActionError("Goods receipt not found.");
    if (grn.status !== "COMPLETED") throw new ActionError("Material is stored after the quality check.");
    if (grn.storedAt) throw new ActionError("Already marked as stored.");
    await db.goodsReceipt.update({ where: { id: grnId }, data: { storedAt: new Date(), tallyRef: ref, storedById: user.id } });
    await audit({ userId: user.id, action: "store", entityType: "goods_receipt", entityId: grnId, description: `Material stored and entered in Tally${ref ? ` (${ref})` : ""}` });
    notify(user, "stored", () => stepDoers("ST9"), async () => {
      const g = await db.goodsReceipt.findUniqueOrThrow({ where: { id: grnId }, select: { grnNumber: true, invoiceNo: true, vendor: { select: { name: true } } } });
      return {
        subject: `${g.grnNumber}: enter the bill (${g.vendor.name})`,
        lines: [`${g.grnNumber} from ${g.vendor.name} is stored${ref ? ` (Tally ${ref})` : ""}.`, `Please enter and match the bill${g.invoiceNo ? ` — invoice ${g.invoiceNo}` : ""}.`],
        link: `/bills/new?grn=${grnId}&from=fms`,
        files: { grnId, poId: grn.poId },
      };
    });
    refresh(grnId, grn.poId);
  });
}

// ── Vendor issues ────────────────────────────────────────────────────────────

export async function raiseVendorIssue(raw: VendorIssueInput) {
  return runAction(async () => {
    const user = await authorize("raiseIssue");
    const input = vendorIssueSchema.parse(raw);
    const vendor = await db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } });
    if (!vendor) throw new ActionError("Vendor not found.");
    const issue = await db.vendorIssue.create({
      data: {
        vendorId: input.vendorId,
        poId: input.poId,
        grnId: input.grnId,
        itemId: input.itemId,
        type: input.type,
        description: input.description,
        qtyAffected: input.qtyAffected,
        raisedById: user.id,
      },
      select: { id: true },
    });
    await audit({ userId: user.id, action: "issue", entityType: "vendor", entityId: input.vendorId, description: `Issue raised: ${input.description.slice(0, 120)}` });
    notify(user, "vendorIssue", () => usersWith("resolveIssue"), async () => {
      const v = await db.vendor.findUniqueOrThrow({ where: { id: input.vendorId }, select: { name: true } });
      return {
        subject: `Vendor issue: ${v.name}`,
        lines: [`${user.name} raised an issue with ${v.name}:`, `“${input.description}”`],
        link: input.grnId ? `/goods-receipts/${input.grnId}` : input.poId ? `/purchase-orders/${input.poId}` : `/vendors/${input.vendorId}`,
        files: { grnId: input.grnId, poId: input.poId },
      };
    });
    if (input.grnId) refresh(input.grnId, input.poId ?? undefined);
    if (input.poId) revalidatePath(`/purchase-orders/${input.poId}`);
    revalidatePath(`/vendors/${input.vendorId}`);
    return { id: issue.id };
  });
}

export async function resolveVendorIssue(issueId: number, resolution: string) {
  return runAction(async () => {
    const user = await authorize("resolveIssue");
    const text = z.string().trim().min(3, "Say how it was resolved, e.g. replacement received or debit note raised").max(1000).parse(resolution);
    const issue = await db.vendorIssue.findUnique({ where: { id: issueId }, select: { vendorId: true, grnId: true, poId: true } });
    if (!issue) throw new ActionError("Issue not found.");
    const { count } = await db.vendorIssue.updateMany({
      where: { id: issueId, status: "OPEN" },
      data: { status: "RESOLVED", resolution: text, resolvedById: user.id, resolvedAt: new Date() },
    });
    if (!count) throw new ActionError("This issue is already resolved.");
    await audit({ userId: user.id, action: "resolve", entityType: "vendor", entityId: issue.vendorId, description: `Issue resolved: ${text.slice(0, 120)}` });
    if (issue.grnId) refresh(issue.grnId, issue.poId ?? undefined);
    if (issue.poId) revalidatePath(`/purchase-orders/${issue.poId}`);
    revalidatePath(`/vendors/${issue.vendorId}`);
  });
}
