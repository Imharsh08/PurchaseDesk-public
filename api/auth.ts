/**
 * Sign-in and permission checks for the API. The web app sends the user's session token as
 * "Authorization: Bearer …"; every route except /ping goes through requireUser, and routes that
 * change or reveal restricted data also through requirePermission — the same rules as today
 * (src/lib/roles).
 */
import { createMiddleware } from "hono/factory";
import type { Role } from "@/generated/prisma-node/enums";
import { can, type Permission } from "@/lib/roles";
import { decrypt } from "@/lib/session-token";
import { db } from "./db";

/** The signed-in user; approvalLimit (incl. GST, null = no limit) is used by approval checks. */
export type ApiUser = { id: number; name: string; email: string; roles: Role[]; approvalLimit: number | null };
export type ApiEnv = { Variables: { user: ApiUser } };

export const requireUser = createMiddleware<ApiEnv>(async (c, next) => {
  const auth = c.req.header("authorization");
  const session = auth?.toLowerCase().startsWith("bearer ") ? await decrypt(auth.slice(7)) : null;
  if (!session) return c.json({ error: "Your session has expired. Please sign in again." }, 401);
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, email: true, roles: true, active: true, approvalLimit: true } });
  if (!user?.active) return c.json({ error: "Your session has expired. Please sign in again." }, 401);
  const { id, name, email, roles, approvalLimit } = user;
  c.set("user", { id, name, email, roles, approvalLimit: approvalLimit === null ? null : Number(approvalLimit) });
  await next();
});

export const requirePermission = (permission: Permission) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    if (!can(c.get("user").roles, permission)) return c.json({ error: "You don't have permission to do that." }, 403);
    await next();
  });
