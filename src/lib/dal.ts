import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActionError } from "@/lib/action-error";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/roles";
import { SESSION_COOKIE, decrypt } from "@/lib/session";

export type CurrentUser = Awaited<ReturnType<typeof loadUser>>;

async function loadUser(userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, roles: true, department: true, active: true, approvalLimit: true, gmailConnectedAt: true },
  });
  if (!user) return null;
  const { gmailConnectedAt, ...rest } = user;
  // Plain values only, so the user object can be passed to client components.
  return { ...rest, approvalLimit: user.approvalLimit === null ? null : Number(user.approvalLimit), gmailConnected: !!gmailConnectedAt };
}

/** Returns the signed-in, active user or null. Memoised per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);
  if (!session) return null;
  const user = await loadUser(session.userId);
  if (!user || !user.active) return null;
  return user;
});

/** For pages: redirects to /login when signed out. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects home when the user lacks the permission. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.roles, permission)) redirect("/");
  return user;
}

export { ActionError };

/** For server actions: throws instead of redirecting. */
export async function authorize(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Your session has expired. Please sign in again.");
  if (permission && !can(user.roles, permission)) {
    throw new ActionError("You don't have permission to do that.");
  }
  return user;
}
