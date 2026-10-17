import "server-only";

import { BILL_VIEWS, daysLate, type BillView } from "@/lib/screens/options";

import { within, type DateRange } from "@/lib/date-range";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";

const billInclude = { vendor: { select: { id: true, name: true } }, po: { select: { id: true, poNumber: true } } } as const;

/**
 * Bills & payments. Top-bar date range: bills by invoice date, receipts by date received. Unpaid and
 * to-pass bills are always complete: the outstanding total and ageing are worked out from them.
 */
export async function loadBillsScreen({ view: viewKey, limit, range }: { view: string | undefined; limit: number; range: DateRange | null }) {
  const view: BillView = BILL_VIEWS.find((v) => v.key === viewKey)?.key ?? "due";
  const on = within(range);
  const [unpaid, toPass, noBill, paid, paidCount] = await Promise.all([
    db.bill.findMany({ where: { status: "PASSED", paymentStatus: { not: "PAID" }, invoiceDate: on }, orderBy: { dueDate: "asc" }, include: billInclude }),
    db.bill.findMany({ where: { status: { in: ["ENTERED", "HOLD"] }, invoiceDate: on }, orderBy: { createdAt: "asc" }, include: billInclude }),
    db.goodsReceipt.findMany({
      where: { status: "COMPLETED", bill: null, receivedAt: on },
      orderBy: { qcAt: "asc" },
      select: { id: true, grnNumber: true, receivedAt: true, qcAt: true, invoiceNo: true, invoiceAmount: true, vendor: { select: { id: true, name: true, msme: true } }, po: { select: { poNumber: true } } },
    }),
    view === "paid"
      ? db.bill.findMany({ where: { paymentStatus: "PAID", invoiceDate: on }, orderBy: { updatedAt: "desc" }, take: limit, include: billInclude })
      : Promise.resolve([]),
    view === "paid" ? db.bill.count({ where: { paymentStatus: "PAID", invoiceDate: on } }) : Promise.resolve(0),
  ]);

  const outstanding = (b: (typeof unpaid)[number]) => toNumber(b.payableAmount) - toNumber(b.paidAmount);
  const overdue = unpaid.filter((b) => daysLate(b.dueDate) > 0);
  const buckets = [
    { label: "Not yet due", test: (d: number) => d <= 0 },
    { label: "1–30 days late", test: (d: number) => d >= 1 && d <= 30 },
    { label: "31–60", test: (d: number) => d >= 31 && d <= 60 },
    { label: "61–90", test: (d: number) => d >= 61 && d <= 90 },
    { label: "90+", test: (d: number) => d > 90 },
  ].map((b) => ({ label: b.label, amount: unpaid.filter((x) => b.test(daysLate(x.dueDate))).reduce((s, x) => s + outstanding(x), 0) }));

  return {
    view,
    unpaid,
    toPass,
    noBill,
    paid,
    paidCount,
    counts: { due: unpaid.length, pass: toPass.length, receipts: noBill.length } as Record<string, number>,
    summary: {
      totalOutstanding: unpaid.reduce((s, b) => s + outstanding(b), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, b) => s + outstanding(b), 0),
      msmeRiskCount: unpaid.filter((b) => b.msme && daysLate(b.dueDate) > -7).length,
      buckets,
    },
  };
}

export { BILL_VIEWS, type BillView, daysLate } from "@/lib/screens/options";
