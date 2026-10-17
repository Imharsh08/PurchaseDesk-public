import "server-only";

import { invoiceFilesFor } from "@/lib/bills";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { loadTimeline } from "@/lib/screens/timeline";
import type { Role } from "@/generated/prisma/enums";

/** A bill page: the bill, its lines and payments, the invoice copies, what is still owed, and where its indent is. Null when it doesn't exist. */
export async function loadBillScreen(id: number, user: { roles: Role[] }) {
  const [bill, invoiceFiles] = await Promise.all([
    db.bill.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true, msmeCategory: true } },
        po: { select: { id: true, poNumber: true, indentId: true } },
        grn: { select: { id: true, grnNumber: true, receivedAt: true, qcAt: true } },
        lines: { orderBy: { id: "asc" } },
        payments: { orderBy: { paidOn: "asc" }, include: { createdBy: { select: { name: true } } } },
        createdBy: { select: { name: true } },
        passedBy: { select: { name: true } },
      },
    }),
    invoiceFilesFor({ billId: id }),
  ]);
  if (!bill) return null;
  const timeline = await loadTimeline(bill.po.indentId, bill.po.id, user.roles);

  const outstanding = Math.max(0, toNumber(bill.payableAmount) - toNumber(bill.paidAmount));
  const today = new Date();
  const overdueDays = bill.paymentStatus !== "PAID" ? Math.floor((today.getTime() - bill.dueDate.getTime()) / 86_400_000) : 0;
  const debit = toNumber(bill.debitAmount);

  return { bill, invoiceFiles, outstanding, overdueDays, debit, timeline };
}
