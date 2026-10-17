import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type AuditEntry = {
  userId: number | null;
  action: string;
  entityType: "purchase_order" | "indent" | "vendor" | "item" | "user" | "settings" | "goods_receipt" | "quotation" | "bill";
  entityId: number;
  description?: string;
  data?: Prisma.InputJsonValue;
};

type Client = Pick<typeof db, "auditLog">;

export async function audit(entry: AuditEntry, client: Client = db) {
  await client.auditLog.create({ data: entry });
}
