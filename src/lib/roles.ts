import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  PURCHASER: "Purchaser",
  WAREHOUSE: "Warehouse",
  ACCOUNTS: "Accounts",
};

export const PERMISSIONS = {
  raiseIndent: ["ADMIN", "MANAGER", "PURCHASER", "WAREHOUSE"],
  updateStock: ["ADMIN", "MANAGER", "PURCHASER", "WAREHOUSE"],
  // Record material arriving against a PO (gate / store entry, invoice & bilty)
  receiveGoods: ["ADMIN", "MANAGER", "PURCHASER", "WAREHOUSE"],
  // Quantity & quality check that accepts material into stock
  qualityCheck: ["ADMIN", "MANAGER", "WAREHOUSE"],
  raiseIssue: ["ADMIN", "MANAGER", "PURCHASER", "WAREHOUSE"],
  resolveIssue: ["ADMIN", "MANAGER", "PURCHASER"],
  manageQuotations: ["ADMIN", "MANAGER", "PURCHASER"],
  approveComparison: ["ADMIN", "MANAGER"],
  manageMasters: ["ADMIN", "MANAGER", "PURCHASER"],
  createPO: ["ADMIN", "MANAGER", "PURCHASER"],
  approvePO: ["ADMIN", "MANAGER"],
  sendPO: ["ADMIN", "MANAGER", "PURCHASER"],
  cancelPO: ["ADMIN", "MANAGER"],
  // Revise an issued PO (qty, rate, delivery, terms); the amendment then needs approval
  amendPO: ["ADMIN", "MANAGER", "PURCHASER"],
  // Bulk import of items, vendors and opening stock from Excel
  importData: ["ADMIN", "MANAGER"],
  // Vendor bills: enter & match, pass for payment, record payments
  enterBill: ["ADMIN", "MANAGER", "PURCHASER", "ACCOUNTS"],
  passBill: ["ADMIN", "MANAGER", "ACCOUNTS"],
  recordPayment: ["ADMIN", "MANAGER", "ACCOUNTS"],
  viewReports: ["ADMIN", "MANAGER", "PURCHASER", "ACCOUNTS"],
  manageSettings: ["ADMIN"],
  manageUsers: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Only these people (DELETE_ADMIN_EMAILS, comma-separated) can permanently delete records (to undo
 * entries made by mistake), and only with the shared admin delete password. Everyone else cancels or
 * deactivates instead. Server only: the browser doesn't see the setting.
 */
export function deleteAdmins() {
  return (process.env.DELETE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function canHardDelete(email: string) {
  return deleteAdmins().includes(email.trim().toLowerCase());
}

/** A user may do something when any one of their roles allows it. */
export function can(roles: readonly Role[], permission: Permission) {
  return roles.some((r) => (PERMISSIONS[permission] as readonly Role[]).includes(r));
}

export function isAdmin(roles: readonly Role[]) {
  return roles.includes("ADMIN");
}

/** Admins and managers (owners of everyone's indents & POs). */
export function isLead(roles: readonly Role[]) {
  return roles.includes("ADMIN") || roles.includes("MANAGER");
}

/** Roles in a fixed order, for display ("Purchaser, Warehouse"). */
export function roleNames(roles: readonly Role[]) {
  return (Object.keys(ROLE_LABELS) as Role[]).filter((r) => roles.includes(r)).map((r) => ROLE_LABELS[r]).join(", ");
}
