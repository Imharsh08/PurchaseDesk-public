import "server-only";

import { notFound, redirect } from "next/navigation";
import { loadQuotationFormData } from "@/app/(app)/indents/[id]/quotations/form-data";
import { loadPOFormOptions } from "@/app/(app)/purchase-orders/form-data";
import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { invoiceFilesFor, loadBillContext } from "@/lib/bills";
import { db } from "@/lib/db";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";
import { toDateInput } from "@/lib/format";
import { RECEIVABLE_PO, loadReceivablePO } from "@/lib/grn";
import { AMENDABLE } from "@/lib/po-status";
import { getCompany } from "@/lib/purchase-orders";
import { loadStockRows } from "@/lib/stock-data";

/**
 * Form screens (new / edit indent, quotation, PO, amendment, goods receipt, bill, stock count): the
 * options and current values each form starts from. Like the record loaders, shared by the Next
 * pages and the API. They call notFound() / redirect() exactly as the pages did (e.g. a PO that is no
 * longer a draft opens the PO instead); the API turns those into a 404 / { redirect }.
 */

/** `?items=12:250,5:300` (item id : qty) pre-fills lines, e.g. from the stock dashboard. */
function parsePrefill(raw: unknown) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((pair) => pair.split(":").map(Number))
    .filter(([id, qty]) => Number.isInteger(id) && id > 0 && Number.isFinite(qty) && qty > 0)
    .slice(0, 100)
    .map(([id, qty]) => ({ id, qty }));
}

/** An item for the indent form's picker, with the units it can be asked in. */
function indentItemOption(i: { id: number; sku: string; name: string; category: string | null } & Parameters<typeof toUnitItem>[0]) {
  return { id: i.id, sku: i.sku, name: i.name, uom: i.uom, category: i.category, unitItem: toUnitItem(i) };
}

export async function loadNewIndentForm(itemsParam: unknown) {
  const prefill = parsePrefill(itemsParam);
  const items = await db.item.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, category: true, currentStock: true, ...unitItemSelect },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = prefill
    .filter((p) => byId.has(p.id))
    .map((p) => {
      const item = byId.get(p.id)!;
      return { itemId: item.id, description: item.name, quantity: String(p.qty), currentStock: item.currentStock?.toString() ?? "", remarks: "", uom: item.uom };
    });
  return { items: items.map(indentItemOption), lines };
}

export async function loadEditIndentForm(id: number) {
  const indent = await db.indent.findUnique({ where: { id }, include: { items: { orderBy: { lineNo: "asc" } } } });
  if (!indent) notFound();
  if (indent.status !== "DRAFT") redirect(`/indents/${id}`);
  const items = await db.item.findMany({
    where: { OR: [{ active: true }, { id: { in: indent.items.map((i) => i.itemId) } }] },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, category: true, ...unitItemSelect },
  });
  return { indent, items: items.map(indentItemOption) };
}

export async function loadNewQuotationForm(indentId: number) {
  return loadQuotationFormData(indentId);
}

export async function loadEditQuotationForm(indentId: number, quotationId: number) {
  const quote = await db.quotation.findUnique({ where: { id: quotationId }, include: { items: true, vendor: { select: { name: true } } } });
  if (!quote || quote.indentId !== indentId) notFound();
  const { indent, vendors, lines } = await loadQuotationFormData(indentId, quote.vendorId);
  return { quote, indent, vendors, lines };
}

/** "New purchase order": POs come from approved indents; this lists the ones waiting. */
export async function loadNewPurchaseOrderScreen() {
  const ready = await db.indent.findMany({
    where: { status: "APPROVED" },
    orderBy: { approvedAt: "asc" },
    select: { id: true, indentNumber: true, department: true, items: { select: { description: true }, orderBy: { lineNo: "asc" } } },
  });
  return { ready };
}

export async function loadEditPurchaseOrderForm(poId: number) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { items: { orderBy: { lineNo: "asc" } } } });
  if (!po) notFound();
  if (po.status !== "DRAFT") redirect(`/purchase-orders/${po.id}`);
  const options = await loadPOFormOptions({ vendorId: po.vendorId, itemIds: po.items.map((i) => i.itemId) });
  return { po, options };
}

export async function loadAmendForm(id: number) {
  const [po, pending, addresses, company] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: { select: { name: true } },
        items: {
          orderBy: { lineNo: "asc" },
          include: { item: { select: { sku: true } }, grnItems: { where: { grn: { status: "PENDING_QC" } }, select: { receivedQty: true } } },
        },
      },
    }),
    db.poAmendment.count({ where: { poId: id, status: "PENDING" } }),
    listAddresses(),
    getCompany(),
  ]);
  if (!po) notFound();
  if (!AMENDABLE.includes(po.status) || pending) redirect(`/purchase-orders/${id}`);
  return { po, addresses, fallback: defaultAddressText(addresses, company) };
}

/** Receiving material against a PO (?po=). */
export async function loadReceiveForm(poParam: unknown) {
  const poId = Number(poParam);
  if (!Number.isInteger(poId) || poId <= 0) redirect("/goods-receipts");
  const loaded = await loadReceivablePO(poId);
  if (!loaded) notFound();
  const { po, lines } = loaded;
  const today = new Date();
  return {
    po,
    lines,
    receivable: RECEIVABLE_PO.includes(po.status),
    late: !!po.expectedDeliveryDate && po.expectedDeliveryDate.getTime() < today.getTime() - 86_400_000,
  };
}

/** Entering (or editing) the bill for a checked goods receipt (?grn=). */
export async function loadBillForm(grnParam: unknown) {
  const grnId = Number(grnParam);
  if (!Number.isInteger(grnId) || grnId <= 0) redirect("/bills");
  const ctx = await loadBillContext(grnId);
  if (!ctx) notFound();
  const { grn } = ctx;
  const [existing, invoiceFiles] = await Promise.all([
    grn.bill ? db.bill.findUnique({ where: { id: grn.bill.id }, include: { lines: true } }) : null,
    invoiceFilesFor(grn.id),
  ]);
  if (existing && existing.status !== "ENTERED" && existing.status !== "HOLD") redirect(`/bills/${existing.id}`);

  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const initial = existing
    ? {
        invoiceNo: existing.invoiceNo,
        invoiceDate: toDateInput(existing.invoiceDate),
        taxableAmount: s(existing.taxableAmount),
        taxAmount: s(existing.taxAmount),
        otherCharges: s(existing.otherCharges),
        totalAmount: s(existing.totalAmount),
        otherDebit: s(existing.otherDebit),
        otherDebitReason: existing.otherDebitReason ?? "",
        remarks: existing.remarks ?? "",
        lines: Object.fromEntries(existing.lines.map((l) => [l.grnItemId, { billedQty: s(l.billedQty), billedRate: s(l.billedRate) }])),
      }
    : (() => {
        // Default: billed exactly as accepted at the PO rate; challan qty if it was recorded.
        const lines = Object.fromEntries(ctx.lines.map((l) => [l.grnItemId, { billedQty: String(l.invoiceQty ?? l.receivedQty), billedRate: String(l.poRate) }]));
        const taxable = ctx.lines.reduce((sum, l) => sum + (l.invoiceQty ?? l.receivedQty) * l.poRate, 0);
        const tax = ctx.lines.reduce((sum, l) => sum + ((l.invoiceQty ?? l.receivedQty) * l.poRate * l.gstRate) / 100, 0);
        return {
          invoiceNo: grn.invoiceNo ?? "",
          invoiceDate: toDateInput(grn.invoiceDate),
          taxableAmount: taxable.toFixed(2),
          taxAmount: tax.toFixed(2),
          otherCharges: "0",
          totalAmount: grn.invoiceAmount ? s(grn.invoiceAmount) : (taxable + tax).toFixed(2),
          otherDebit: "0",
          otherDebitReason: "",
          remarks: "",
          lines,
        };
      })();
  return { ctx, grn, existing, invoiceFiles, initial };
}

/** Stock count: every active item, least recently counted first. */
export async function loadStockUpdateForm() {
  const rows = await loadStockRows();
  const items = [...rows].sort((a, b) => (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0) || a.name.localeCompare(b.name));
  return { items };
}
