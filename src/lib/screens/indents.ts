import "server-only";

import { INDENT_TABS, QUOTATION_STAGES } from "@/lib/screens/options";

import type { Prisma } from "@/generated/prisma/client";
import { within, type DateRange } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { ListParams } from "@/lib/screens/purchase-orders";

/** Indents: one page of the chosen tab, plus how many there are in every tab. */
export async function loadIndentList({ q, tab: tabKey, limit, range }: ListParams) {
  const tab = INDENT_TABS.find((t) => t.key === tabKey) ?? INDENT_TABS[0];
  const on = within(range);
  const searchOnly: Prisma.IndentWhereInput | undefined = q
    ? {
        OR: [
          { indentNumber: { contains: q, mode: "insensitive" } },
          { department: { contains: q, mode: "insensitive" } },
          { purpose: { contains: q, mode: "insensitive" } },
          { items: { some: { description: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : undefined;
  // Top-bar date range: the date the indent was raised (drafts: when it was started).
  const search: Prisma.IndentWhereInput | undefined = on
    ? { AND: [searchOnly ?? {}, { OR: [{ submittedAt: on }, { submittedAt: null, createdAt: on }] }] }
    : searchOnly;

  const [indents, counts] = await Promise.all([
    db.indent.findMany({
      where: { ...search, ...(tab.statuses ? { status: { in: tab.statuses } } : {}) },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      include: {
        requestedBy: { select: { name: true } },
        items: { orderBy: { lineNo: "asc" }, select: { description: true } },
        _count: { select: { quotations: true, purchaseOrders: true } },
      },
    }),
    db.indent.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
  ]);
  const tabCounts = Object.fromEntries(
    INDENT_TABS.map((t) => [t.key, counts.filter((c) => !t.statuses || t.statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0)]),
  ) as Record<string, number>;
  return { tab: tab.key, indents, tabCounts };
}

export async function loadQuotationBoard(range: DateRange | null) {
  const indents = await db.indent.findMany({
    where: { status: { in: QUOTATION_STAGES }, submittedAt: within(range) },
    orderBy: [{ priority: "desc" }, { requiredBy: "asc" }, { createdAt: "asc" }],
    include: {
      items: { orderBy: { lineNo: "asc" }, select: { description: true } },
      quotations: { select: { vendor: { select: { name: true } } } },
      requestedBy: { select: { name: true } },
    },
  });
  return { indents };
}

export { INDENT_TABS, QUOTATION_STAGES } from "@/lib/screens/options";
