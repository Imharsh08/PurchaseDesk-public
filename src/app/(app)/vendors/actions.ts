"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { stateName } from "@/lib/states";
import { vendorItemSchema, vendorSchema, type VendorInput, type VendorItemInput } from "@/lib/validation";

export async function saveVendor(id: number | null, raw: VendorInput) {
  return runAction(async () => {
    const user = await authorize("manageMasters");
    const input = vendorSchema.parse(raw);
    const data = { ...input, state: stateName(input.stateCode) };

    const vendor = id
      ? await db.vendor.update({ where: { id }, data })
      : await db.vendor.create({ data });

    await audit({
      userId: user.id,
      action: id ? "update" : "create",
      entityType: "vendor",
      entityId: vendor.id,
      description: `${id ? "Updated" : "Created"} vendor ${vendor.name}`,
    });
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendor.id}`);
    return { id: vendor.id };
  });
}

/** Adds or updates an item this vendor supplies (agreed rate, vendor's code, lead time). */
export async function saveVendorItem(vendorId: number, raw: VendorItemInput) {
  return runAction(async () => {
    const user = await authorize("manageMasters");
    const input = vendorItemSchema.parse(raw);
    const [vendor, item, existing] = await Promise.all([
      db.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } }),
      db.item.findUnique({ where: { id: input.itemId }, select: { id: true, name: true } }),
      db.vendorItem.findUnique({ where: { vendorId_itemId: { vendorId, itemId: input.itemId } }, select: { rate: true } }),
    ]);
    if (!vendor) throw new ActionError("Vendor not found.");
    if (!item) throw new ActionError("Item not found.");
    const rateChanged = input.rate !== null && (existing?.rate === null || existing?.rate === undefined || Number(existing.rate) !== input.rate);
    const data = {
      vendorItemCode: input.vendorItemCode,
      rate: input.rate,
      leadTimeDays: input.leadTimeDays,
      preferred: input.preferred,
      active: input.active,
      notes: input.notes,
      ...(rateChanged ? { rateSource: "MANUAL" as const, rateDate: new Date() } : {}),
    };
    await db.vendorItem.upsert({
      where: { vendorId_itemId: { vendorId, itemId: input.itemId } },
      create: { vendorId, itemId: input.itemId, ...data },
      update: data,
    });
    await audit({
      userId: user.id,
      action: existing ? "update" : "create",
      entityType: "vendor",
      entityId: vendorId,
      description: `${existing ? "Updated" : "Added"} supplied item ${item.name}${rateChanged ? ` at ₹${input.rate}` : ""}`,
    });
    revalidatePath(`/vendors/${vendorId}`);
    revalidatePath(`/items/${input.itemId}`);
  });
}

export async function removeVendorItem(vendorItemId: number) {
  return runAction(async () => {
    const user = await authorize("manageMasters");
    const link = await db.vendorItem.findUnique({ where: { id: vendorItemId }, include: { item: { select: { name: true } } } });
    if (!link) throw new ActionError("Not found.");
    await db.vendorItem.delete({ where: { id: vendorItemId } });
    await audit({ userId: user.id, action: "delete", entityType: "vendor", entityId: link.vendorId, description: `Removed supplied item ${link.item.name}` });
    revalidatePath(`/vendors/${link.vendorId}`);
    revalidatePath(`/items/${link.itemId}`);
  });
}
