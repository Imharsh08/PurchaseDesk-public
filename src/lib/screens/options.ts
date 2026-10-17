/**
 * Options and small helpers behind the screens (tabs, views, report list) — no database, so both the
 * server loaders (src/lib/screens/*) and the browser (shared views, the web app) can use them.
 */
import type { IndentStatus, POStatus } from "@/generated/prisma/enums";

export const PO_TABS: { key: string; label: string; statuses?: POStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts", statuses: ["DRAFT"] },
  { key: "pending", label: "Pending approval", statuses: ["PENDING_APPROVAL"] },
  { key: "to-send", label: "To send", statuses: ["APPROVED"] },
  { key: "open", label: "Open with vendor", statuses: ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"] },
  { key: "closed", label: "Closed", statuses: ["COMPLETED", "CANCELLED"] },
];

export const INDENT_TABS: { key: string; label: string; statuses?: IndentStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts", statuses: ["DRAFT"] },
  { key: "quoting", label: "Collecting quotes", statuses: ["OPEN"] },
  { key: "pending", label: "Pending approval", statuses: ["PENDING_APPROVAL"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "ordered", label: "PO created", statuses: ["ORDERED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

/** Indents between quotation and PO, for the Quotations board. */
export const QUOTATION_STAGES: IndentStatus[] = ["OPEN", "PENDING_APPROVAL", "APPROVED"];

export const GRN_VIEWS = [
  { key: "awaiting", label: "Awaiting delivery" },
  { key: "pending", label: "Pending check" },
  { key: "all", label: "All receipts" },
  { key: "issues", label: "Open issues" },
] as const;

export type GrnView = (typeof GRN_VIEWS)[number]["key"];

export const BILL_VIEWS = [
  { key: "due", label: "Unpaid" },
  { key: "pass", label: "To pass" },
  { key: "receipts", label: "Receipts without bill" },
  { key: "paid", label: "Paid" },
] as const;

export type BillView = (typeof BILL_VIEWS)[number]["key"];

export const DAY = 86_400_000;

/** Days past the due date (negative: days left), counted in whole calendar days. */
export function daysLate(dueDate: Date | string, today = new Date()) {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayUtc - new Date(dueDate).getTime()) / DAY);
}

export const REPORTS = [
  { key: "spend", label: "Spend analysis", dated: true },
  { key: "savings", label: "Savings", dated: true },
  { key: "price", label: "Price variance", dated: true },
  { key: "vendors", label: "Vendor scorecard", dated: true },
  { key: "po", label: "PO register", dated: true },
  { key: "pending", label: "Pending POs", dated: false },
  { key: "grn", label: "GRN register", dated: true },
  { key: "payables", label: "Payables ageing", dated: false },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

/** History choices on the sheet when no date range is picked (days back). */
export const FMS_HISTORY = [30, 90, 180, 365] as const;

/** Spend analysis groupings (labels; the SQL for each lives in src/lib/reports). */
export const SPEND_GROUP_LABELS = { vendor: "Vendor", category: "Category", department: "Department", item: "Item", month: "Month" } as const;

/** Vendor delivery / quality scores are judged on this many days of completed receipts. */
export const PERFORMANCE_WINDOW_DAYS = 365;
