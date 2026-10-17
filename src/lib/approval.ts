import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/action-error";
import { formatINR } from "@/lib/format";
import { PERMISSIONS } from "@/lib/roles";

/**
 * Delegation of authority: each approver has an approval limit (incl. GST). A comparison, PO
 * or amendment above someone's limit must be approved by a person whose limit covers it.
 * No limit set = unlimited.
 */
type Approver = { id: number; approvalLimit: number | null };

export function withinLimit(user: Approver, amount: number) {
  return user.approvalLimit === null || amount <= user.approvalLimit;
}

/** Active users who may approve this amount (for messages like "needs approval from …"). */
export async function approversFor(amount: number, excludeUserId?: number) {
  const users = await db.user.findMany({
    where: {
      active: true,
      roles: { hasSome: [...PERMISSIONS.approvePO] as Role[] },
      OR: [{ approvalLimit: null }, { approvalLimit: { gte: amount } }],
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return users.map((u) => u.name);
}

/** Human-readable reason this user can't approve the amount, or null if they can. */
export async function limitBlock(user: Approver, amount: number) {
  if (withinLimit(user, amount)) return null;
  const names = await approversFor(amount, user.id);
  return `${formatINR(amount)} is above your approval limit of ${formatINR(user.approvalLimit ?? 0)}.${
    names.length ? ` It needs approval from ${names.join(", ")}.` : " No approver has a high enough limit; ask an admin to raise one."
  }`;
}

export async function assertWithinLimit(user: Approver, amount: number) {
  const block = await limitBlock(user, amount);
  if (block) throw new ActionError(block);
}
