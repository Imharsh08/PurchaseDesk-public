/**
 * The API's version of src/lib/dal: the same functions and messages, but the signed-in user comes
 * from the API request (api/context.ts) instead of the Next app's session cookie. The API build
 * points "@/lib/dal" here, so server actions run unchanged.
 */
import { ActionError } from "@/lib/action-error";
import { can, type Permission } from "@/lib/roles";
import { currentRequest } from "../context";
import { db } from "../db";

export { ActionError };

async function loadUser(userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, roles: true, department: true, active: true, approvalLimit: true, gmailConnectedAt: true },
  });
  if (!user) return null;
  const { gmailConnectedAt, ...rest } = user;
  return { ...rest, approvalLimit: user.approvalLimit === null ? null : Number(user.approvalLimit), gmailConnected: !!gmailConnectedAt };
}

export type CurrentUser = Awaited<ReturnType<typeof loadUser>>;

/** The signed-in, active user or null. Loaded once per request. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const ctx = currentRequest();
  if (!ctx) return null;
  ctx.user ??= loadUser(ctx.userId);
  const user = (await ctx.user) as CurrentUser;
  return user?.active ? user : null;
}

/** Pages only in the Next app; kept so shared code type-checks the same. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Your session has expired. Please sign in again.");
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.roles, permission)) throw new ActionError("You don't have permission to do that.");
  return user;
}

/** For server actions: throws instead of redirecting (same as the Next app). */
export async function authorize(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Your session has expired. Please sign in again.");
  if (permission && !can(user.roles, permission)) throw new ActionError("You don't have permission to do that.");
  return user;
}
