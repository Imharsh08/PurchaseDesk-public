import "server-only";

import { PO_TABS } from "@/lib/screens/options";

import type { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/date-range";
import { within } from "@/lib/date-range";
import { db } from "@/lib/db";
import { poTransporter } from "@/lib/po-transporter";

/**
 * Screen loaders: the data behind each screen, shared by the Next.js pages and the API
 * (web/), so both always show the same figures.
 */

export type ListParams = { q: string; tab: string | undefined; limit: number; range: DateRange | null };

/** Purchase orders: one page of the chosen tab, plus how many there are in every tab. */
export async function loadPurchaseOrderList({ q, tab: tabKey, limit, range }: ListParams) {
  const tab = PO_TABS.find((t) => t.key === tabKey) ?? PO_TABS[0];
  const on = within(range);
  const searchOnly: Prisma.PurchaseOrderWhereInput | undefined = q
    ? {
        OR: [
          { poNumber: { contains: q, mode: "insensitive" } },
          { quotationRef: { contains: q, mode: "insensitive" } },
          { vendor: { name: { contains: q, mode: "insensitive" } } },
          { vendor: { code: { contains: q, mode: "insensitive" } } },
          { items: { some: { description: { contains: q, mode: "insensitive" } } } },
          { dispatchTransporter: { contains: q, mode: "insensitive" } },
          { terms: { contains: q, mode: "insensitive" } },
          ...(/^\d+$/.test(q) ? [{ id: Number(q) }] : []),
        ],
      }
    : undefined;
  // Top-bar date range: the PO date (drafts have none yet: when they were started).
  const search: Prisma.PurchaseOrderWhereInput | undefined = on
    ? { AND: [searchOnly ?? {}, { OR: [{ poDate: on }, { poDate: null, createdAt: on }] }] }
    : searchOnly;

  const [orders, counts] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { ...search, ...(tab.statuses ? { status: { in: tab.statuses } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        // Contact and the first line (what is ordered), so the team can call the vendor to collect it.
        vendor: { select: { name: true, code: true, contactPerson: true, phone: true } },
        items: { orderBy: { lineNo: "asc" }, take: 1, select: { description: true, quantity: true, uom: true } },
        createdBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.purchaseOrder.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
  ]);
  const tabCounts = Object.fromEntries(
    PO_TABS.map((t) => [t.key, counts.filter((c) => !t.statuses || t.statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0)]),
  ) as Record<string, number>;
  return { tab: tab.key, orders: orders.map((po) => ({ ...po, transporter: poTransporter(po) })), tabCounts };
}

export { PO_TABS } from "@/lib/screens/options";
