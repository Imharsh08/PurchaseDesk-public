import type { CheckResult, GrnStatus, IssueStatus, IssueType } from "@/generated/prisma/enums";

// Labels shared by server pages and client components (no server-only imports here).

export const GRN_STATUS: Record<GrnStatus, { label: string; tone: string }> = {
  PENDING_QC: { label: "Pending check", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  COMPLETED: { label: "Completed", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};

export const CHECK_LABEL: Record<CheckResult, string> = { PASS: "Pass", FAIL: "Fail" };

export const ISSUE_TYPES: Record<IssueType, string> = {
  SHORT_QTY: "Short quantity",
  EXCESS_QTY: "Excess quantity",
  QUALITY: "Quality rejected",
  DAMAGED: "Damaged in transit",
  WRONG_ITEM: "Wrong item / spec",
  LATE_DELIVERY: "Late delivery",
  DOCUMENTS: "Invoice / documents",
  RATE_MISMATCH: "Rate mismatch on invoice",
  OTHER: "Other",
};

export const ISSUE_STATUS: Record<IssueStatus, { label: string; tone: string }> = {
  OPEN: { label: "Open", tone: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  RESOLVED: { label: "Resolved", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

export const DOCUMENT_LABEL: Record<string, string> = {
  INVOICE: "Invoice",
  BILTY: "Bilty / LR",
  QUALITY_CERT: "Test certificate",
  OTHER: "Other",
  PO_PDF: "PO PDF",
  QUOTATION: "Quotation",
};
