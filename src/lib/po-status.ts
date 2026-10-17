import type { POStatus } from "@/generated/prisma/enums";

export const PO_STATUS: Record<POStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  APPROVED: { label: "Approved", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  SENT: { label: "Sent to vendor", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" },
  PARTIALLY_RECEIVED: { label: "Partially received", tone: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  COMPLETED: { label: "Completed", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
};

export const PO_STATUS_ORDER: POStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "ACKNOWLEDGED",
  "PARTIALLY_RECEIVED",
  "COMPLETED",
  "CANCELLED",
];

/** The four lifecycle steps shown in the PO progress tracker. */
export const PO_STEPS = [
  { key: "created", label: "Created" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
] as const;

/** Issued POs show their number; before approval they're referred to by internal id. */
export function poDisplayNumber(po: { id: number; poNumber: string | null }) {
  return po.poNumber ?? `PO #${po.id}`;
}

/** Issued POs that can still be revised. */
export const AMENDABLE: POStatus[] = ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"];
