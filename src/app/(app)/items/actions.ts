"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { authorize } from "@/lib/dal";
import { itemSchema, type ItemInput } from "@/lib/validation";

export async function saveItem(id: number | null, raw: ItemInput) {
  return runAction(async () => {
    const user = await authorize("manageMasters");
    const data = itemSchema.parse(raw);

    const item = id ? await db.item.update({ where: { id }, data }) : await db.item.create({ data });

    await audit({
      userId: user.id,
      action: id ? "update" : "create",
      entityType: "item",
      entityId: item.id,
      description: `${id ? "Updated" : "Created"} item ${item.sku} ${item.name}`,
    });
    revalidatePath("/items");
    return { id: item.id };
  });
}
