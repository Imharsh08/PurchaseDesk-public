"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { formatQty } from "@/lib/format";

const countsSchema = z.object({
  counts: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().min(0, "Stock cannot be negative").max(1e9),
      }),
    )
    .min(1, "Enter at least one stock quantity")
    .max(1000),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});

/** Records a physical stock count for each item and updates its current stock. */
export async function saveStockCounts(raw: z.input<typeof countsSchema>) {
  return runAction(async () => {
    const user = await authorize("updateStock");
    const { counts, note } = countsSchema.parse(raw);
    const ids = [...new Set(counts.map((c) => c.itemId))];
    if (ids.length !== counts.length) throw new ActionError("An item appears twice in this count.");

    const items = await db.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, uom: true, currentStock: true } });
    if (items.length !== ids.length) throw new ActionError("One of the items no longer exists.");
    const byId = new Map(items.map((i) => [i.id, i]));
    const now = new Date();

    await db.$transaction(async (tx) => {
      for (const c of counts) {
        const item = byId.get(c.itemId)!;
        await tx.stockCount.create({
          data: { itemId: c.itemId, quantity: c.quantity, previousQty: item.currentStock, note, countedById: user.id, countedAt: now },
        });
        await tx.item.update({
          where: { id: c.itemId },
          data: { currentStock: c.quantity, stockUpdatedAt: now, stockUpdatedById: user.id },
        });
      }
    });

    await audit({
      userId: user.id,
      action: "stock_count",
      entityType: "item",
      entityId: counts[0].itemId,
      description:
        counts.length === 1
          ? `Stock of ${byId.get(counts[0].itemId)!.name} counted: ${formatQty(counts[0].quantity)} ${byId.get(counts[0].itemId)!.uom}`
          : `Stock counted for ${counts.length} items${note ? ` (${note})` : ""}`,
      data: { counts, note },
    });
    revalidatePath("/stock");
    revalidatePath("/");
    return { saved: counts.length };
  });
}
