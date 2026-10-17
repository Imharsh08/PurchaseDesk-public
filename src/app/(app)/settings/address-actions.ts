"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { runAction } from "@/lib/action";
import type { AddressOption } from "@/lib/addresses";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { isAdmin } from "@/lib/roles";
import { addressSchema, type AddressInput } from "@/lib/validation";

const select = { id: true, label: true, details: true, defaultBilling: true, defaultShipping: true } as const;

/** Only one address can be the default for billing, and one for shipping. */
async function clearOtherDefaults(tx: Prisma.TransactionClient, id: number, input: { defaultBilling: boolean; defaultShipping: boolean }) {
  if (input.defaultBilling) await tx.companyAddress.updateMany({ where: { id: { not: id }, defaultBilling: true }, data: { defaultBilling: false } });
  if (input.defaultShipping) await tx.companyAddress.updateMany({ where: { id: { not: id }, defaultShipping: true }, data: { defaultShipping: false } });
}

/** Adds an address to the book. Purchase can do this from the PO form when a new site is needed. */
export async function createAddress(raw: AddressInput) {
  return runAction<AddressOption>(async () => {
    const user = await authorize("createPO");
    const input = addressSchema.parse(raw);
    // Only admins choose the defaults used on every new PO.
    const defaults = isAdmin(user.roles) ? input : { ...input, defaultBilling: false, defaultShipping: false };
    const address = await db.$transaction(async (tx) => {
      const created = await tx.companyAddress.create({ data: defaults, select });
      await clearOtherDefaults(tx, created.id, defaults);
      return created;
    });
    await audit({ userId: user.id, action: "create", entityType: "settings", entityId: 1, description: `Address “${address.label}” added` });
    revalidatePath("/settings");
    return address;
  });
}

export async function updateAddress(id: number, raw: AddressInput) {
  return runAction<AddressOption>(async () => {
    const user = await authorize("manageSettings");
    const input = addressSchema.parse(raw);
    const address = await db.$transaction(async (tx) => {
      const { count } = await tx.companyAddress.updateMany({ where: { id, active: true }, data: input });
      if (!count) throw new ActionError("This address was removed. Refresh and try again.");
      await clearOtherDefaults(tx, id, input);
      return tx.companyAddress.findUniqueOrThrow({ where: { id }, select });
    });
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: `Address “${address.label}” updated` });
    revalidatePath("/settings");
    return address;
  });
}

/** Hides the address from the pickers. POs that used it keep their printed copy. */
export async function removeAddress(id: number) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const address = await db.companyAddress.update({
      where: { id },
      data: { active: false, defaultBilling: false, defaultShipping: false },
      select: { label: true },
    });
    await audit({ userId: user.id, action: "delete", entityType: "settings", entityId: 1, description: `Address “${address.label}” removed` });
    revalidatePath("/settings");
  });
}
