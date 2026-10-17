import "server-only";

import type { POStatus } from "@/generated/prisma/enums";
import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/action-error";
import { formatAmount, formatDate, formatQty, toNumber } from "@/lib/format";
import { calcLine, calcTotals, type TaxMode } from "@/lib/po-calc";
import { getCompany } from "@/lib/purchase-orders";
import { amendmentSchema, type AmendmentInput } from "@/lib/validation";

import { AMENDABLE } from "@/lib/po-status";

export { AMENDABLE };

export type AmendmentChanges = {
  header: {
    expectedDeliveryDate: string | null;
    paymentTerms: string | null;
    /** Absent on amendments requested before POs had a billing address: left unchanged. */
    billingAddress?: string | null;
    deliveryAddress: string | null;
    terms: string | null;
  };
  lines: { poItemId: number; quantity: number; rate: number; discountPct: number; gstRate: number; remove: boolean }[];
};

const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/**
 * Validates a proposed amendment against the PO as it is now and works out the new totals and
 * a readable list of changes. Quantities can't go below what has already been received.
 */
export async function evaluateAmendment(poId: number, raw: AmendmentInput) {
  const input = amendmentSchema.parse(raw);
  const [po, addresses, company] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        items: {
          orderBy: { lineNo: "asc" },
          include: { grnItems: { where: { grn: { status: "PENDING_QC" } }, select: { receivedQty: true } } },
        },
      },
    }),
    listAddresses(),
    getCompany(),
  ]);
  if (!po) throw new ActionError("Purchase order not found.");
  if (!AMENDABLE.includes(po.status)) throw new ActionError("Only issued, open purchase orders can be amended.");

  const entered = new Map(input.lines.map((l) => [l.poItemId, l]));
  const summary: string[] = [];
  const kept: { quantity: number; rate: number; discountPct: number; gstRate: number }[] = [];
  const lines: AmendmentChanges["lines"] = [];

  for (const line of po.items) {
    const old = {
      quantity: toNumber(line.quantity),
      rate: toNumber(line.rate),
      discountPct: toNumber(line.discountPct),
      gstRate: toNumber(line.gstRate),
    };
    const e = entered.get(line.id);
    const next = e ? { quantity: e.quantity, rate: e.rate, discountPct: e.discountPct, gstRate: e.gstRate } : old;
    const received = toNumber(line.quantityReceived) + line.grnItems.reduce((s, g) => s + toNumber(g.receivedQty), 0);
    const label = `Line ${line.lineNo} (${line.description})`;

    if (e?.remove) {
      if (received > 0) throw new ActionError(`${label}: material has been received, so the line can't be removed. Reduce the quantity instead.`);
      summary.push(`${label} removed`);
      lines.push({ poItemId: line.id, ...old, remove: true });
      continue;
    }
    if (next.quantity < received) {
      throw new ActionError(`${label}: quantity can't be less than the ${formatQty(received)} ${line.uom} already received.`);
    }
    if (!same(next.quantity, old.quantity)) summary.push(`${label} qty ${formatQty(old.quantity)} → ${formatQty(next.quantity)} ${line.uom}`);
    if (!same(next.rate, old.rate)) summary.push(`${label} rate ₹${formatAmount(old.rate)} → ₹${formatAmount(next.rate)}`);
    if (!same(next.discountPct, old.discountPct)) summary.push(`${label} discount ${formatQty(old.discountPct)}% → ${formatQty(next.discountPct)}%`);
    if (!same(next.gstRate, old.gstRate)) summary.push(`${label} GST ${formatQty(old.gstRate)}% → ${formatQty(next.gstRate)}%`);
    kept.push(next);
    lines.push({ poItemId: line.id, ...next, remove: false });
  }
  if (!kept.length) throw new ActionError("A PO must keep at least one line. Cancel the PO instead.");

  // The form shows the default address when the PO has none saved: unchanged means unchanged.
  const fallback = defaultAddressText(addresses, company);
  const keepIfSame = (next: string | null, stored: string | null, effective: string) =>
    (next ?? "").trim() === (stored ?? effective).trim() ? stored : next;
  const header: AmendmentChanges["header"] = {
    ...input.header,
    billingAddress:
      input.header.billingAddress === undefined ? po.billingAddress : keepIfSame(input.header.billingAddress, po.billingAddress, fallback.billing),
    deliveryAddress: keepIfSame(input.header.deliveryAddress, po.deliveryAddress, fallback.shipping),
  };
  const oldDate = po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString().slice(0, 10) : null;
  if ((header.expectedDeliveryDate ?? null) !== oldDate) {
    summary.push(`Delivery date ${oldDate ? formatDate(oldDate) : "not set"} → ${header.expectedDeliveryDate ? formatDate(header.expectedDeliveryDate) : "not set"}`);
  }
  if ((header.paymentTerms ?? null) !== (po.paymentTerms ?? null)) summary.push(`Payment terms “${po.paymentTerms ?? ""}” → “${header.paymentTerms ?? ""}”`);
  if ((header.billingAddress ?? null) !== (po.billingAddress ?? null)) summary.push("Billing address changed");
  if ((header.deliveryAddress ?? null) !== (po.deliveryAddress ?? null)) summary.push("Shipping address changed");
  if ((header.terms ?? null) !== (po.terms ?? null)) summary.push("Terms & conditions changed");
  if (!summary.length) throw new ActionError("Nothing has changed.");

  const totals = calcTotals(kept, po.taxMode as TaxMode);
  return {
    po,
    reason: input.reason,
    changes: { header, lines } satisfies AmendmentChanges,
    summary,
    oldTotal: toNumber(po.grandTotal),
    newTotal: totals.grandTotal,
  };
}

/** Writes an approved amendment onto the PO: lines, header, totals and revision number. */
export async function applyAmendment(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  po: { id: number; status: POStatus; revision: number; taxMode: string },
  changes: AmendmentChanges,
) {
  const taxMode = po.taxMode as TaxMode;
  const kept = changes.lines.filter((l) => !l.remove);
  for (const l of changes.lines) {
    if (l.remove) {
      await tx.poItem.delete({ where: { id: l.poItemId } });
      continue;
    }
    const a = calcLine(l, taxMode);
    await tx.poItem.update({
      where: { id: l.poItemId },
      data: { quantity: l.quantity, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, taxableAmount: a.taxable, taxAmount: a.tax, lineTotal: a.total },
    });
  }
  const t = calcTotals(kept, taxMode);
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      expectedDeliveryDate: changes.header.expectedDeliveryDate ? new Date(changes.header.expectedDeliveryDate) : null,
      paymentTerms: changes.header.paymentTerms,
      ...(changes.header.billingAddress !== undefined ? { billingAddress: changes.header.billingAddress } : {}),
      deliveryAddress: changes.header.deliveryAddress,
      terms: changes.header.terms,
      subtotal: t.subtotal,
      cgstAmount: t.cgst,
      sgstAmount: t.sgst,
      igstAmount: t.igst,
      roundOff: t.roundOff,
      grandTotal: t.grandTotal,
      revision: po.revision + 1,
      revisedAt: new Date(),
      // The vendor has the old copy: the revised PO has to be sent again.
      ...(po.status === "SENT" || po.status === "ACKNOWLEDGED" ? { status: "APPROVED" as const } : {}),
    },
  });
}
