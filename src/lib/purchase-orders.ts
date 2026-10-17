import "server-only";

import { DEFAULT_COMPANY } from "@/lib/company-defaults";

export { DEFAULT_COMPANY };

import type { CompanySettings, Prisma } from "@/generated/prisma/client";
import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { db } from "@/lib/db";
import { lineUnit } from "@/lib/item-units";
import { ActionError } from "@/lib/action-error";
import { toNumber } from "@/lib/format";
import { renderPOPdfDocument, type POPdfData } from "@/lib/pdf/po-pdf";
import { calcLine, calcTotals, determineTaxMode } from "@/lib/po-calc";
import { formatPONumber, poCounterKey } from "@/lib/po-number";
import { stateName } from "@/lib/states";
import { saveFile, tryReadStoredFile } from "@/lib/storage";
import { poSchema, type POInput } from "@/lib/validation";

type Tx = Prisma.TransactionClient;

export async function getCompany() {
  return (await db.companySettings.findUnique({ where: { id: 1 } })) ?? DEFAULT_COMPANY;
}

/**
 * Validates PO input and computes every amount on the server.
 * Client-sent totals are never trusted.
 */
async function preparePO(raw: POInput) {
  const input = poSchema.parse(raw);

  const [vendor, company, items] = await Promise.all([
    db.vendor.findUnique({ where: { id: input.vendorId } }),
    getCompany(),
    db.item.findMany({ where: { id: { in: input.items.map((l) => l.itemId) } }, include: { units: { select: { unit: true, factor: true } } } }),
  ]);
  if (!vendor) throw new ActionError("The selected vendor no longer exists.");
  if (!vendor.active) throw new ActionError(`Vendor ${vendor.name} is inactive.`);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const taxMode = determineTaxMode(company.stateCode, vendor);

  const lines = input.items.map((line, index) => {
    const item = itemMap.get(line.itemId);
    if (!item) throw new ActionError(`Line ${index + 1}: item not found.`);
    const amounts = calcLine(line, taxMode);
    return {
      lineNo: index + 1,
      itemId: item.id,
      description: line.description,
      hsnCode: item.hsnCode,
      uom: lineUnit(item, line.uom, index + 1),
      quantity: line.quantity,
      rate: line.rate,
      discountPct: line.discountPct,
      gstRate: line.gstRate,
      taxableAmount: amounts.taxable,
      taxAmount: amounts.tax,
      lineTotal: amounts.total,
      remarks: line.remarks,
    };
  });

  const totals = calcTotals(lines, taxMode);

  const header = {
    vendorId: vendor.id,
    expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
    quotationRef: input.quotationRef,
    quotationDate: input.quotationDate ? new Date(input.quotationDate) : null,
    billingAddress: input.billingAddress,
    deliveryAddress: input.deliveryAddress,
    paymentTerms: input.paymentTerms,
    terms: input.terms,
    internalNotes: input.internalNotes,
    taxMode,
    subtotal: totals.subtotal,
    cgstAmount: totals.cgst,
    sgstAmount: totals.sgst,
    igstAmount: totals.igst,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
  };

  return { header, lines };
}

export async function createPO(raw: POInput, userId: number) {
  const { header, lines } = await preparePO(raw);
  return db.purchaseOrder.create({
    data: { ...header, createdById: userId, items: { create: lines } },
    select: { id: true },
  });
}

export async function updateDraftPO(poId: number, raw: POInput) {
  const linked = await db.purchaseOrder.findUnique({ where: { id: poId }, select: { quotationId: true, status: true } });
  if (linked?.quotationId) {
    // Vendor, items, quantities and rates were approved on the comparison: only the header changes.
    if (linked.status !== "DRAFT") throw new ActionError("Only draft purchase orders can be edited.");
    const input = poSchema.parse(raw);
    return db.purchaseOrder.update({
      where: { id: poId },
      data: {
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
        quotationRef: input.quotationRef,
        quotationDate: input.quotationDate ? new Date(input.quotationDate) : null,
        billingAddress: input.billingAddress,
        deliveryAddress: input.deliveryAddress,
        paymentTerms: input.paymentTerms,
        terms: input.terms,
        internalNotes: input.internalNotes,
      },
      select: { id: true },
    });
  }

  const { header, lines } = await preparePO(raw);
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true } });
    if (!po) throw new ActionError("Purchase order not found.");
    if (po.status !== "DRAFT") throw new ActionError("Only draft purchase orders can be edited.");
    await tx.poItem.deleteMany({ where: { poId } });
    return tx.purchaseOrder.update({
      where: { id: poId },
      data: { ...header, rejectionReason: null, items: { create: lines } },
      select: { id: true },
    });
  });
}

export { formatPONumber, poCounterKey } from "@/lib/po-number";

/** Atomically reserves the next PO number in the company's format; `sender` gives {INITIALS}. */
export async function nextPONumber(tx: Tx, company: Pick<CompanySettings, "poPrefix" | "poNumberStyle">, sender: string, date = new Date()) {
  const key = poCounterKey(company.poNumberStyle, date);
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatPONumber(company.poNumberStyle, company.poPrefix, counter.value, date, sender);
}

export async function loadPOPdfData(poId: number): Promise<POPdfData> {
  const [po, company, addresses] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        vendor: true,
        items: { orderBy: { lineNo: "asc" }, include: { item: { select: { sku: true } } } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    getCompany(),
    listAddresses(),
  ]);
  if (!po) throw new ActionError("Purchase order not found.");

  const [logo, logo2] = await Promise.all([tryReadStoredFile(company.logoPath), tryReadStoredFile(company.logo2Path)]);
  // POs saved before addresses were chosen per PO fall back to the current defaults.
  const fallback = defaultAddressText(addresses, company);

  return {
    draft: !po.poNumber,
    poNumber: po.poNumber,
    poDate: po.poDate,
    revision: po.revision,
    revisedAt: po.revisedAt,
    quotationRef: po.quotationRef,
    quotationDate: po.quotationDate,
    terms: po.terms,
    billingAddress: po.billingAddress?.trim() || fallback.billing,
    shippingAddress: po.deliveryAddress?.trim() || fallback.shipping,
    company: { ...company, stateName: stateName(company.stateCode), logo, logo2 },
    vendor: po.vendor,
    items: po.items.map((i) => ({
      description: i.description,
      sku: i.item.sku,
      uom: i.uom,
      quantity: toNumber(i.quantity),
      rate: toNumber(i.rate),
      discountPct: toNumber(i.discountPct),
      remarks: i.remarks,
    })),
    preparedBy: po.createdBy,
  };
}

export async function renderPOPdf(poId: number) {
  const data = await loadPOPdfData(poId);
  const pdf = await renderPOPdfDocument(data);
  return { pdf, data };
}

export function poFileName(poNumber: string) {
  return `${poNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

/**
 * Renders the issued PO and stores it as the active PO document.
 * The stored file is what gets previewed, downloaded and emailed.
 */
export async function generateAndStorePOPdf(poId: number, userId: number | null) {
  const { pdf, data } = await renderPOPdf(poId);
  if (!data.poNumber) throw new ActionError("A PO number is assigned on approval.");

  const previous = await db.document.findFirst({
    where: { poId, type: "PO_PDF" },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (previous?.version ?? 0) + 1;
  const fileName = poFileName(data.poNumber);
  const stored = await saveFile(`purchase-orders/${poId}/v${version}-${fileName}`, pdf, "application/pdf");

  return db.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { poId, type: "PO_PDF", status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    return tx.document.create({
      data: {
        type: "PO_PDF",
        poId,
        fileName,
        mimeType: "application/pdf",
        version,
        createdById: userId,
        ...stored,
      },
    });
  });
}

export async function getActivePOPdf(poId: number) {
  return db.document.findFirst({
    where: { poId, type: "PO_PDF", status: "ACTIVE" },
    orderBy: { version: "desc" },
  });
}
