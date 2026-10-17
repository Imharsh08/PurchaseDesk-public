"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { billDueDate, matchBill } from "@/lib/bill-calc";
import { loadBillContext, nextBillNumber, nextDebitNoteNumber } from "@/lib/bills";
import { db } from "@/lib/db";
import { checkDocumentFile, storeGrnDocument } from "@/lib/documents";
import { ActionError, authorize } from "@/lib/dal";
import { formatDate, formatINR, toNumber } from "@/lib/format";
import { notify, usersWith } from "@/lib/notify";
import { round2 } from "@/lib/po-calc";
import { billSchema, paymentSchema, type BillInput, type PaymentInput } from "@/lib/validation";

function refresh(billId?: number, grnId?: number, poId?: number) {
  revalidatePath("/bills");
  revalidatePath("/");
  if (billId) revalidatePath(`/bills/${billId}`);
  if (grnId) revalidatePath(`/goods-receipts/${grnId}`);
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
}

/** Enters (or corrects) the vendor's bill for a checked goods receipt and matches it. */
export async function saveBill(grnId: number, raw: BillInput) {
  return runAction(async () => {
    const user = await authorize("enterBill");
    const input = billSchema.parse(raw);
    const ctx = await loadBillContext(grnId);
    if (!ctx) throw new ActionError("Goods receipt not found.");
    const { grn } = ctx;
    if (grn.status !== "COMPLETED") throw new ActionError("Enter the bill after the quantity & quality check.");

    const byId = new Map(ctx.lines.map((l) => [l.grnItemId, l]));
    if (input.lines.length !== ctx.lines.length || input.lines.some((l) => !byId.has(l.grnItemId))) {
      throw new ActionError("Enter billed qty and rate for every item on the receipt.");
    }
    const m = matchBill({
      lines: input.lines.map((l) => ({ ...byId.get(l.grnItemId)!, billedQty: l.billedQty, billedRate: l.billedRate })),
      otherCharges: input.otherCharges,
      otherDebit: input.otherDebit,
      totalAmount: input.totalAmount,
    });
    if (m.payableAmount < 0) throw new ActionError("Deductions are more than the invoice total.");

    const invoiceDate = new Date(input.invoiceDate);
    const { dueDate } = billDueDate({ invoiceDate, acceptedAt: grn.qcAt, creditDays: ctx.creditDays, msme: ctx.msme });
    const header = {
      invoiceNo: input.invoiceNo,
      invoiceDate,
      taxableAmount: input.taxableAmount,
      taxAmount: input.taxAmount,
      otherCharges: input.otherCharges,
      totalAmount: input.totalAmount,
      expectedAmount: m.expectedAmount,
      debitAmount: m.debitAmount,
      otherDebit: input.otherDebit,
      otherDebitReason: input.otherDebitReason,
      payableAmount: m.payableAmount,
      creditDays: ctx.creditDays,
      dueDate,
      msme: ctx.msme,
      remarks: input.remarks,
    };
    const lines = m.lines.map((l, i) => {
      const src = byId.get(input.lines[i].grnItemId)!;
      return {
        grnItemId: src.grnItemId,
        description: src.description,
        uom: src.uom,
        acceptedQty: l.acceptedQty,
        poRate: l.poRate,
        gstRate: l.gstRate,
        billedQty: l.billedQty,
        billedRate: l.billedRate,
        debitAmount: l.debit,
      };
    });

    const bill = await db.$transaction(async (tx) => {
      const existing = await tx.bill.findUnique({ where: { grnId }, select: { id: true, status: true } });
      if (existing) {
        if (existing.status !== "ENTERED" && existing.status !== "HOLD") throw new ActionError("A passed bill can't be changed.");
        await tx.billLine.deleteMany({ where: { billId: existing.id } });
        return tx.bill.update({ where: { id: existing.id }, data: { ...header, lines: { create: lines } }, select: { id: true, billNumber: true } });
      }
      return tx.bill.create({
        data: {
          ...header,
          billNumber: await nextBillNumber(tx),
          grnId,
          poId: grn.poId,
          vendorId: grn.vendorId,
          createdById: user.id,
          lines: { create: lines },
        },
        select: { id: true, billNumber: true },
      });
    });

    const flags = [m.qtyMismatch && "qty billed above accepted", m.rateMismatch && "rate above PO"].filter(Boolean).join(", ");
    await audit({
      userId: user.id,
      action: "bill",
      entityType: "goods_receipt",
      entityId: grnId,
      description: `Bill ${input.invoiceNo} entered as ${bill.billNumber}: ${formatINR(input.totalAmount)}${m.debitAmount ? `, debit ${formatINR(m.debitAmount)} (${flags || "other deduction"})` : ", matched"}`,
    });
    notify(user, "billEntered", () => usersWith("passBill"), {
      subject: `${bill.billNumber}: pass bill ${input.invoiceNo} (${grn.vendor.name})`,
      lines: [
        `${user.name} entered invoice ${input.invoiceNo} from ${grn.vendor.name} for ${formatINR(input.totalAmount)}.`,
        m.debitAmount ? `Mismatch: debit ${formatINR(m.debitAmount)} (${flags || "other deduction"}). Payable ${formatINR(m.payableAmount)}.` : "It matches the PO and goods receipt.",
        ctx.msme ? `MSME vendor — payment due ${formatDate(dueDate)}.` : `Due ${formatDate(dueDate)}.`,
      ],
      link: `/bills/${bill.id}`,
      files: { grnId, poId: grn.poId },
    });
    refresh(bill.id, grnId, grn.poId);
    return { id: bill.id, billNumber: bill.billNumber, debit: m.debitAmount };
  });
}

async function loadBill(id: number) {
  const bill = await db.bill.findUnique({ where: { id }, select: { id: true, status: true, grnId: true, poId: true, billNumber: true, debitAmount: true, debitNoteNumber: true, payableAmount: true, paidAmount: true } });
  if (!bill) throw new ActionError("Bill not found.");
  return bill;
}

/** Approves the bill for payment; a debit note number is issued if anything is deducted. */
export async function passBill(id: number) {
  return runAction(async () => {
    const user = await authorize("passBill");
    const bill = await loadBill(id);
    const dn = await db.$transaction(async (tx) => {
      const debitNoteNumber = toNumber(bill.debitAmount) > 0 && !bill.debitNoteNumber ? await nextDebitNoteNumber(tx) : bill.debitNoteNumber;
      const { count } = await tx.bill.updateMany({
        where: { id, status: { in: ["ENTERED", "HOLD"] } },
        data: { status: "PASSED", passedById: user.id, passedAt: new Date(), holdReason: null, debitNoteNumber },
      });
      if (!count) throw new ActionError("Only bills waiting to be passed can be passed.");
      return debitNoteNumber;
    });
    await audit({
      userId: user.id,
      action: "approve",
      entityType: "goods_receipt",
      entityId: bill.grnId,
      description: `${bill.billNumber} passed for ${formatINR(bill.payableAmount)}${dn ? ` with debit note ${dn}` : ""}`,
    });
    notify(user, "billPassed", () => usersWith("recordPayment"), async () => {
      const b = await db.bill.findUniqueOrThrow({ where: { id }, select: { invoiceNo: true, dueDate: true, msme: true, vendor: { select: { name: true } } } });
      return {
        subject: `${bill.billNumber}: pay ${formatINR(bill.payableAmount)} to ${b.vendor.name} by ${formatDate(b.dueDate)}`,
        lines: [`${user.name} passed invoice ${b.invoiceNo} for payment: ${formatINR(bill.payableAmount)}${dn ? ` (after debit note ${dn})` : ""}.`, `Due ${formatDate(b.dueDate)}${b.msme ? " — MSME vendor, 45-day rule applies" : ""}.`],
        link: `/bills/${id}`,
        files: { grnId: bill.grnId, poId: bill.poId },
      };
    });
    refresh(id, bill.grnId, bill.poId);
    return { debitNoteNumber: dn };
  });
}

const reasonSchema = z.string().trim().min(3, "Please give a short reason").max(500);

export async function holdBill(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("passBill");
    const text = reasonSchema.parse(reason);
    const bill = await loadBill(id);
    const { count } = await db.bill.updateMany({ where: { id, status: "ENTERED" }, data: { status: "HOLD", holdReason: text } });
    if (!count) throw new ActionError("Only bills waiting to be passed can be put on hold.");
    await audit({ userId: user.id, action: "hold", entityType: "goods_receipt", entityId: bill.grnId, description: `${bill.billNumber} put on hold: ${text}` });
    refresh(id, bill.grnId, bill.poId);
  });
}

export async function cancelBill(id: number, reason: string) {
  return runAction(async () => {
    const user = await authorize("passBill");
    const text = reasonSchema.parse(reason);
    const bill = await loadBill(id);
    if (toNumber(bill.paidAmount) > 0) throw new ActionError("This bill has payments recorded and can't be cancelled.");
    // Frees the receipt so the corrected bill can be entered.
    await db.bill.delete({ where: { id } });
    await audit({ userId: user.id, action: "cancel", entityType: "goods_receipt", entityId: bill.grnId, description: `${bill.billNumber} cancelled: ${text}` });
    refresh(undefined, bill.grnId, bill.poId);
  });
}

export async function recordPayment(billId: number, raw: PaymentInput) {
  return runAction(async () => {
    const user = await authorize("recordPayment");
    const input = paymentSchema.parse(raw);
    const bill = await loadBill(billId);
    if (bill.status !== "PASSED") throw new ActionError("Pass the bill before recording a payment.");
    const outstanding = round2(toNumber(bill.payableAmount) - toNumber(bill.paidAmount));
    if (input.amount > outstanding + 0.005) throw new ActionError(`Only ${formatINR(outstanding)} is outstanding on this bill.`);
    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: { billId, amount: input.amount, paidOn: new Date(input.paidOn), mode: input.mode, reference: input.reference, note: input.note, createdById: user.id },
      });
      const paid = round2(toNumber(bill.paidAmount) + input.amount);
      await tx.bill.update({
        where: { id: billId },
        data: { paidAmount: paid, paymentStatus: paid + 0.005 >= toNumber(bill.payableAmount) ? "PAID" : "PARTLY_PAID" },
      });
    });
    await audit({
      userId: user.id,
      action: "payment",
      entityType: "goods_receipt",
      entityId: bill.grnId,
      description: `Payment ${formatINR(input.amount)} by ${input.mode}${input.reference ? ` (${input.reference})` : ""} against ${bill.billNumber}`,
    });
    refresh(billId, bill.grnId, bill.poId);
  });
}

/** Attaches the vendor's invoice copy to the goods receipt being billed (also shown on the bill and PO). */
export async function attachBillInvoice(grnId: number, formData: FormData) {
  return runAction(async () => {
    const user = await authorize("enterBill");
    const grn = await db.goodsReceipt.findUnique({ where: { id: grnId }, select: { id: true, poId: true, status: true, bill: { select: { id: true } } } });
    if (!grn) throw new ActionError("Goods receipt not found.");
    if (grn.status === "CANCELLED") throw new ActionError("This receipt was cancelled.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose the invoice file to attach.");
    checkDocumentFile(file);
    const doc = await storeGrnDocument(grn, "INVOICE", file, user.id);
    await audit({ userId: user.id, action: "upload", entityType: "goods_receipt", entityId: grn.id, description: `Attached invoice (${file.name.slice(0, 80)})` });
    refresh(grn.bill?.id, grn.id, grn.poId);
    return { id: doc.id };
  });
}

export async function removeBillInvoice(documentId: number) {
  return runAction(async () => {
    const user = await authorize("enterBill");
    const doc = await db.document.findUnique({
      where: { id: documentId },
      select: { type: true, fileName: true, poId: true, grn: { select: { id: true, bill: { select: { id: true } } } } },
    });
    if (!doc?.grn || doc.type !== "INVOICE") throw new ActionError("Invoice file not found.");
    await db.document.update({ where: { id: documentId }, data: { status: "SUPERSEDED" } });
    await audit({ userId: user.id, action: "delete", entityType: "goods_receipt", entityId: doc.grn.id, description: `Removed invoice (${doc.fileName})` });
    refresh(doc.grn.bill?.id, doc.grn.id, doc.poId ?? undefined);
  });
}
