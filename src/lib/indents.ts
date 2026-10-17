import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/action-error";
import { dateFormatter, toNumber } from "@/lib/format";
import { calcLine, calcTotals, determineTaxMode, round2 } from "@/lib/po-calc";
import { withTransport } from "@/lib/po-transporter";
import { getCompany } from "@/lib/purchase-orders";
import { itemTransport, transportChoices } from "@/lib/transport";
import { loadTransportOptions } from "@/lib/transport-data";
import {
  NORMAL_WEIGHTS,
  URGENT_WEIGHTS,
  locationOf,
  netRate,
  scoreLine,
  type QuoteFactors,
  type ScoredOffer,
} from "@/lib/quote-scoring";
import { lastPurchaseRates, vendorPerformance } from "@/lib/vendor-history";

type Tx = Prisma.TransactionClient;

/** IND-2026-0001: one running sequence, year of raising in IST. */
export async function nextIndentNumber(tx: Tx, date = new Date()) {
  const counter = await tx.counter.upsert({
    where: { key: "IND:SEQ" },
    create: { key: "IND:SEQ", value: 1 },
    update: { value: { increment: 1 } },
  });
  const year = dateFormatter("en-CA", { year: "numeric" }).format(date);
  return `IND-${year}-${String(counter.value).padStart(4, "0")}`;
}

export async function loadIndent(id: number) {
  return db.indent.findUnique({
    where: { id },
    include: {
      items: { orderBy: { lineNo: "asc" }, include: { item: { select: { sku: true, hsnCode: true, preferredTransport: true } } } },
      quotations: {
        orderBy: { createdAt: "asc" },
        include: {
          vendor: true,
          items: true,
          createdBy: { select: { name: true } },
        },
      },
      requestedBy: { select: { id: true, name: true } },
      comparisonSubmittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      purchaseOrders: {
        select: { id: true, poNumber: true, status: true, grandTotal: true, vendor: { select: { name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
}

export type LoadedIndent = NonNullable<Awaited<ReturnType<typeof loadIndent>>>;

export type ComparisonOffer = ScoredOffer & {
  quoteItemId: number;
  vendorName: string;
  rate: number;
  discountPct: number;
  gstRate: number;
  amount: number;
  remarks: string | null;
};

export type ComparisonLine = {
  indentItemId: number;
  lineNo: number;
  description: string;
  sku: string;
  uom: string;
  quantity: number;
  offers: ComparisonOffer[];
  selectedQuoteItemId: number | null;
  selectionReason: string | null;
  /** Last ordered rate for this item (any vendor), for context. */
  lastPurchase: { rate: number; vendorName: string; date: Date; poNumber: string } | null;
};

export type ComparisonVendor = {
  quotationId: number;
  vendorId: number;
  vendorName: string;
  linesQuoted: number;
  itemsTotal: number;
  /** Freight included in the rates, extra (otherCharges, or at actuals when 0), or not stated. */
  freightTerms: "INCLUDED" | "EXTRA" | null;
  otherCharges: number;
  total: number;
  deliveryDays: number | null;
  creditDays: number;
  paymentTerms: string | null;
  certification: QuoteFactors["certification"];
  location: QuoteFactors["location"];
  averageScore: number;
  validUntil: Date | null;
  /** Delivery & quality history from goods receipts (last 12 months); null = no history yet. */
  onTimePct: number | null;
  rejectionPct: number | null;
  receipts: number;
  openIssues: number;
};

/** Comparative statement: every indent line with each vendor's scored offer. */
export async function buildComparison(indent: LoadedIndent) {
  const [company, perf, lastRates] = await Promise.all([
    getCompany(),
    vendorPerformance(indent.quotations.map((q) => q.vendorId)),
    lastPurchaseRates(indent.items.map((l) => l.itemId)),
  ]);
  const weights = indent.priority === "URGENT" ? URGENT_WEIGHTS : NORMAL_WEIGHTS;

  // Real on-time % and rejection % replace the neutral defaults once a vendor has goods receipts.
  const factors = new Map<number, QuoteFactors>(
    indent.quotations.map((q) => {
      const p = perf.get(q.vendorId);
      return [
        q.id,
        {
          quotationId: q.id,
          deliveryDays: q.deliveryDays,
          location: locationOf(company, q.vendor),
          certification: q.vendor.certification,
          creditDays: q.creditDays,
          earlyDiscountPct: toNumber(q.earlyDiscountPct),
          onTimePct: p?.onTimePct ?? null,
          defectRatePct: p?.lines ? p.rejectionPct : null,
        },
      ];
    }),
  );

  const lines: ComparisonLine[] = indent.items.map((line) => {
    const quantity = toNumber(line.quantity);
    const quoteItems = indent.quotations.flatMap((q) =>
      q.items.filter((qi) => qi.indentItemId === line.id).map((qi) => ({ q, qi })),
    );
    const scored = scoreLine(
      quoteItems.map(({ q, qi }) => ({ quotationId: q.id, netRate: netRate(toNumber(qi.rate), toNumber(qi.discountPct)) })),
      factors,
      weights,
    );
    const offers = scored.map((s) => {
      const { q, qi } = quoteItems.find((x) => x.q.id === s.quotationId)!;
      return {
        ...s,
        quoteItemId: qi.id,
        vendorName: q.vendor.name,
        rate: toNumber(qi.rate),
        discountPct: toNumber(qi.discountPct),
        gstRate: toNumber(qi.gstRate),
        amount: round2(s.netRate * quantity),
        remarks: qi.remarks,
      };
    });
    return {
      indentItemId: line.id,
      lineNo: line.lineNo,
      description: line.description,
      sku: line.item.sku,
      uom: line.uom,
      quantity,
      offers,
      selectedQuoteItemId: line.selectedQuoteItemId,
      selectionReason: line.selectionReason,
      lastPurchase: lastRates.get(line.itemId) ?? null,
    };
  });

  const vendors: ComparisonVendor[] = indent.quotations.map((q) => {
    const mine = lines.flatMap((l) => l.offers.filter((o) => o.quotationId === q.id));
    const itemsTotal = round2(mine.reduce((s, o) => s + o.amount, 0));
    const otherCharges = toNumber(q.otherCharges);
    const f = factors.get(q.id)!;
    const p = perf.get(q.vendorId);
    return {
      quotationId: q.id,
      vendorId: q.vendorId,
      vendorName: q.vendor.name,
      linesQuoted: mine.length,
      itemsTotal,
      freightTerms: q.freightTerms === "INCLUDED" || q.freightTerms === "EXTRA" ? q.freightTerms : otherCharges > 0 ? "EXTRA" : null,
      otherCharges,
      total: round2(itemsTotal + otherCharges),
      deliveryDays: q.deliveryDays,
      creditDays: q.creditDays,
      paymentTerms: q.paymentTerms,
      certification: f.certification,
      location: f.location,
      averageScore: mine.length ? Math.round((mine.reduce((s, o) => s + o.total, 0) / mine.length) * 10) / 10 : 0,
      validUntil: q.validUntil,
      onTimePct: p?.onTimePct ?? null,
      rejectionPct: p?.lines ? p.rejectionPct : null,
      receipts: p?.receipts ?? 0,
      openIssues: p?.openIssues ?? 0,
    };
  });

  return { lines, vendors, weights, urgent: indent.priority === "URGENT" };
}

/**
 * Creates one draft PO per selected vendor from an approved comparative statement.
 * Vendor, items, quantities and rates come from the approved quotes and stay locked on the PO.
 */
export async function createPOsFromIndent(indentId: number, userId: number) {
  const indent = await loadIndent(indentId);
  if (!indent) throw new ActionError("Indent not found.");
  if (indent.status !== "APPROVED") throw new ActionError("POs can only be created from an approved comparative statement.");

  const [company, addresses, transport] = await Promise.all([getCompany(), listAddresses(), loadTransportOptions()]);
  const address = defaultAddressText(addresses, company);
  // The PO terms name the transporter (how the item always comes, else the vendor's own or its
  // city's), to confirm with the vendor.
  const termsFor = (
    vendor: { city: string | null; address: string | null; preferredTransport: string | null },
    items: { preferredTransport: string | null }[],
  ) => {
    const { recommended } = transportChoices(transport, vendor, itemTransport(items));
    return recommended ? withTransport(company.defaultTerms ?? "", recommended) : company.defaultTerms;
  };
  const quoteItemToQuote = new Map(indent.quotations.flatMap((q) => q.items.map((qi) => [qi.id, { q, qi }] as const)));

  const byQuotation = new Map<number, { q: LoadedIndent["quotations"][number]; lines: { line: LoadedIndent["items"][number]; qi: LoadedIndent["quotations"][number]["items"][number] }[] }>();
  for (const line of indent.items) {
    const hit = line.selectedQuoteItemId ? quoteItemToQuote.get(line.selectedQuoteItemId) : undefined;
    if (!hit) throw new ActionError(`Line ${line.lineNo} has no selected vendor.`);
    const group = byQuotation.get(hit.q.id) ?? { q: hit.q, lines: [] };
    group.lines.push({ line, qi: hit.qi });
    byQuotation.set(hit.q.id, group);
  }

  const today = new Date();
  return db.$transaction(async (tx) => {
    const { count } = await tx.indent.updateMany({ where: { id: indentId, status: "APPROVED" }, data: { status: "ORDERED" } });
    if (count === 0) throw new ActionError("This indent was changed by someone else. Refresh and try again.");

    const created: number[] = [];
    for (const { q, lines } of byQuotation.values()) {
      const taxMode = determineTaxMode(company.stateCode, q.vendor);
      const poLines = lines.map(({ line, qi }, i) => {
        const input = {
          quantity: toNumber(line.quantity),
          rate: toNumber(qi.rate),
          discountPct: toNumber(qi.discountPct),
          gstRate: toNumber(qi.gstRate),
        };
        const a = calcLine(input, taxMode);
        return {
          lineNo: i + 1,
          itemId: line.itemId,
          description: line.description,
          hsnCode: line.item.hsnCode,
          uom: line.uom,
          ...input,
          taxableAmount: a.taxable,
          taxAmount: a.tax,
          lineTotal: a.total,
          remarks: line.remarks,
        };
      });
      const t = calcTotals(poLines, taxMode);
      const po = await tx.purchaseOrder.create({
        data: {
          vendorId: q.vendorId,
          indentId,
          quotationId: q.id,
          quotationRef: q.vendorRef,
          quotationDate: q.quoteDate,
          paymentTerms: q.paymentTerms,
          creditDays: q.creditDays,
          terms: termsFor(q.vendor, lines.map(({ line }) => line.item)),
          billingAddress: address.billing,
          deliveryAddress: address.shipping,
          expectedDeliveryDate: q.deliveryDays !== null ? new Date(today.getTime() + q.deliveryDays * 86_400_000) : null,
          taxMode,
          subtotal: t.subtotal,
          cgstAmount: t.cgst,
          sgstAmount: t.sgst,
          igstAmount: t.igst,
          roundOff: t.roundOff,
          grandTotal: t.grandTotal,
          createdById: userId,
          items: { create: poLines },
        },
        select: { id: true },
      });
      created.push(po.id);
    }
    return created;
  });
}
