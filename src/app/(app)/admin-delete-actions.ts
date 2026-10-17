"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { AlreadyDeleted, hardDelete, isDeletable } from "@/lib/admin-delete";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/password-hash";
import { DEFAULT_COMPANY } from "@/lib/purchase-orders";
import { canHardDelete } from "@/lib/roles";

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

async function deleteAdmin() {
  const user = await authorize();
  if (!canHardDelete(user.email)) throw new ActionError("Only the admins listed for deleting records can do this.");
  return user;
}

/** Wrong passwords are logged; after 5 in 15 minutes the user has to wait. */
async function checkPassword(userId: number, password: string) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  // Independent reads: run together.
  const [tries, settings] = await Promise.all([
    db.auditLog.count({ where: { userId, action: "delete_password_wrong", createdAt: { gte: since } } }),
    db.companySettings.findUnique({ where: { id: 1 }, select: { deletePasswordHash: true } }),
  ]);
  if (tries >= MAX_TRIES) throw new ActionError(`Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
  const hash = settings?.deletePasswordHash;
  if (!isPasswordHash(hash)) throw new ActionError("Set the admin delete password first.");
  if (!(await verifyPassword(password, hash))) {
    await audit({ userId, action: "delete_password_wrong", entityType: "settings", entityId: 1, description: "Wrong admin delete password" });
    const left = MAX_TRIES - tries - 1;
    throw new ActionError(left > 0 ? `Wrong admin password. ${left} ${left === 1 ? "try" : "tries"} left.` : `Wrong admin password. Locked for ${LOCK_MINUTES} minutes.`);
  }
}

/**
 * Permanently deletes a record entered by mistake, after the admin delete password. Unless `stay`,
 * the list page comes back in the same response (the record's own page no longer exists).
 */
export async function adminDeleteRecord(entity: string, id: number, password: string, stay = false) {
  const result = await deleteRecord(entity, id, password);
  if (result.ok && !stay) redirect(result.data.redirectTo);
  return result;
}

async function deleteRecord(entity: string, id: number, password: string) {
  return runAction(async () => {
    const user = await deleteAdmin();
    if (!isDeletable(entity) || !Number.isInteger(id)) throw new ActionError("This record can't be deleted.");
    await checkPassword(user.id, password);
    try {
      const deleted = await hardDelete(entity, id);
      // The history entry doesn't change what the user sees next: write it after responding.
      after(() =>
        audit({
          userId: user.id,
          action: "delete",
          entityType: deleted.audit.entityType,
          entityId: deleted.audit.entityId,
          description: `Permanently deleted ${deleted.label}`,
          data: deleted.audit.snapshot,
        }),
      );
      return { label: deleted.label, redirectTo: deleted.redirectTo };
    } catch (error) {
      // Gone already (e.g. a retry after a dropped connection): that's what was wanted.
      if (error instanceof AlreadyDeleted) return { label: "already deleted", redirectTo: error.redirectTo };
      throw error;
    } finally {
      // Lists, counts and the record's own page all change.
      revalidatePath("/", "layout");
    }
  });
}

const passwordSchema = z.string().min(8, "Use at least 8 characters").max(100);

/** Sets the shared admin delete password, or changes it (the current one is needed once set). */
export async function setDeletePassword(current: string, next: string) {
  return runAction(async () => {
    const user = await deleteAdmin();
    const password = passwordSchema.parse(next);
    const settings = await db.companySettings.findUnique({ where: { id: 1 }, select: { deletePasswordHash: true } });
    if (isPasswordHash(settings?.deletePasswordHash)) await checkPassword(user.id, current);
    const deletePasswordHash = await hashPassword(password);
    await db.companySettings.upsert({
      where: { id: 1 },
      create: { ...DEFAULT_COMPANY, tat: undefined, notifications: undefined, transport: undefined, updatedAt: new Date(), deletePasswordHash },
      update: { deletePasswordHash },
    });
    after(() => audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: "Admin delete password set" }));
    revalidatePath("/", "layout");
  });
}
