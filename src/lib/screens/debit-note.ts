import "server-only";

import { db } from "@/lib/db";
import { formatAmount, formatQty, toNumber } from "@/lib/format";
import { round2 } from "@/lib/po-calc";
import { getCompany } from "@/lib/purchase-orders";

/** A printable debit note: the bill's deductions line by line. Null when the bill doesn't exist or has no deduction. */
export async function loadDebitNoteScreen(id: number) {
  const [bill, company] = await Promise.all([
    db.bill.findUnique({
      where: { id },
      include: { vendor: true, po: { select: { poNumber: true } }, grn: { select: { grnNumber: true, receivedAt: true } }, lines: { orderBy: { id: "asc" } } },
    }),
    getCompany(),
  ]);
  if (!bill || toNumber(bill.debitAmount) <= 0) return null;

  const rows = bill.lines
    .filter((l) => toNumber(l.debitAmount) > 0)
    .map((l) => {
      const billedQty = toNumber(l.billedQty);
      const acceptedQty = toNumber(l.acceptedQty);
      const billedRate = toNumber(l.billedRate);
      const poRate = toNumber(l.poRate);
      const gst = toNumber(l.gstRate);
      const debit = toNumber(l.debitAmount);
      const taxable = round2(debit / (1 + gst / 100));
      const reasons = [
        billedQty > acceptedQty && `${formatQty(billedQty - acceptedQty)} ${l.uom} billed above accepted qty (${formatQty(acceptedQty)})`,
        billedRate > poRate && `rate ₹${formatAmount(billedRate)} billed against PO rate ₹${formatAmount(poRate)}`,
      ].filter(Boolean);
      return { id: l.id, description: l.description, reasons, taxable, gst, tax: round2(debit - taxable), debit };
    });
  const other = toNumber(bill.otherDebit);
  const total = toNumber(bill.debitAmount);

  return { bill, company: { ...company, deletePasswordHash: null }, rows, other, total };
}
