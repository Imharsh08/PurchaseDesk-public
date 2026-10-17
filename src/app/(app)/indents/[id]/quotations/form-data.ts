import "server-only";

import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import type { QuoteLine, QuoteVendorOption } from "./quotation-form";

/** Indent lines and selectable vendors for the quotation form. Redirects if quotes can't be edited. */
export async function loadQuotationFormData(indentId: number, editingVendorId?: number) {
  const indent = await db.indent.findUnique({
    where: { id: indentId },
    include: {
      items: { orderBy: { lineNo: "asc" }, include: { item: { select: { sku: true, gstRate: true } } } },
      quotations: { select: { vendorId: true } },
    },
  });
  if (!indent) notFound();
  if (indent.status !== "OPEN") redirect(`/indents/${indentId}`);

  const taken = indent.quotations.map((q) => q.vendorId).filter((v) => v !== editingVendorId);
  const vendors: QuoteVendorOption[] = await db.vendor.findMany({
    where: { OR: [{ active: true, id: { notIn: taken } }, ...(editingVendorId ? [{ id: editingVendorId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, city: true, paymentTerms: true, leadTimeDays: true },
  });
  const lines: QuoteLine[] = indent.items.map((l) => ({
    indentItemId: l.id,
    lineNo: l.lineNo,
    description: l.description,
    sku: l.item.sku,
    uom: l.uom,
    quantity: toNumber(l.quantity),
    defaultGst: toNumber(l.item.gstRate),
  }));
  return { indent, vendors, lines };
}
