import "server-only";

import { db } from "@/lib/db";
import { loadTransportOptions } from "@/lib/transport-data";
import { vendorPerformance, type VendorPerformance } from "@/lib/vendor-history";

/** Vendors (all of them; the table sorts in the browser), with their delivery / quality record. */
export async function loadVendorList(q: string) {
  const vendors = await db.vendor.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { gstin: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { purchaseOrders: true, items: { where: { active: true } }, issues: { where: { status: "OPEN" } } } } },
  });
  const [perf, transport] = await Promise.all([vendorPerformance(vendors.map((v) => v.id)), loadTransportOptions()]);
  // Keyed by vendor id; a plain object so it survives JSON.
  return { vendors, performance: Object.fromEntries(perf) as Record<number, VendorPerformance>, transport };
}

/** Items (all of them; the table sorts in the browser), and the categories in use. */
export async function loadItemList(q: string) {
  const [items, categoryRows] = await Promise.all([
    db.item.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { hsnCode: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { vendors: { where: { active: true } } } } },
    }),
    db.item.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } }),
  ]);
  return { items, categories: categoryRows.map((r) => r.category!).sort() };
}
