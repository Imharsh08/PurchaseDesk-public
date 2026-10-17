/** Bill and payment status labels (no database: shared by the server and the browser). */
import type { BillStatus, PaymentStatus } from "@/generated/prisma/enums";

export const BILL_STATUS: Record<BillStatus, { label: string; tone: string }> = {
  ENTERED: { label: "To pass", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  HOLD: { label: "On hold", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  PASSED: { label: "Passed", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  UNPAID: { label: "Unpaid", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  PARTLY_PAID: { label: "Part paid", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  PAID: { label: "Paid", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};
