import "server-only";

import { listAddresses } from "@/lib/addresses";
import { allowedDomain, isGoogleSignInEnabled } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { poCounterKey } from "@/lib/purchase-orders";

/** Users (admins only): everyone who can sign in, and how sign-in works. */
export async function loadUsersScreen() {
  const users = await db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, roles: true, department: true, active: true, createdAt: true, approvalLimit: true },
  });
  return { users, signIn: { googleSignIn: isGoogleSignInEnabled(), domain: allowedDomain() } };
}

/** The two PO serial counters: one running sequence, and this financial year's (formats that show the FY). */
const PO_COUNTERS = [poCounterKey("{SEQ}"), poCounterKey("{FY}{SEQ}")];

/** Company settings (admins only): letterhead, addresses, PO numbering, FMS steps and Gmail status. */
export async function loadSettingsScreen() {
  const [settings, users, addresses, counters] = await Promise.all([
    db.companySettings.findUnique({ where: { id: 1 } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, roles: true, gmailConnectedAt: true } }),
    listAddresses(),
    db.counter.findMany({ where: { key: { in: PO_COUNTERS } } }),
  ]);
  // The delete-password hash never leaves the server; the forms don't need it.
  const company = settings && { ...settings, deletePasswordHash: null };
  return {
    company,
    users,
    addresses,
    notConnected: users.filter((u) => !u.gmailConnectedAt),
    /** Last serial issued, by counter (see poCounterKey). */
    lastIssued: Object.fromEntries(PO_COUNTERS.map((k) => [k, counters.find((c) => c.key === k)?.value ?? 0])) as Record<string, number>,
  };
}
