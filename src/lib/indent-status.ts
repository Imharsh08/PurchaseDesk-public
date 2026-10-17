import type { IndentStatus } from "@/generated/prisma/enums";

export const INDENT_STATUS: Record<IndentStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  OPEN: { label: "Collecting quotes", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  APPROVED: { label: "Approved", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  ORDERED: { label: "PO created", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
};

/** Minimum quotations before a comparative statement can go for approval without justification. */
export const MIN_QUOTATIONS = 3;
