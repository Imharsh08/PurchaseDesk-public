import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadUnitItems } from "@/lib/item-units";
import { sameUnit, unitFactor } from "@/lib/units";
import { toNumber } from "@/lib/format";
import { netRate } from "@/lib/quote-scoring";
import { vendorPerformance } from "@/lib/vendor-history";

export type ColumnType = "text" | "number" | "money" | "date" | "pct" | "files";
export type ReportColumn = { key: string; label: string; type?: ColumnType; href?: string };
/** A file shown as an icon in a "files" column. */
export type ReportFile = { kind: "PO" | "BILTY" | "INVOICE" | "CERT" | "OTHER"; name: string; href: string };
/** Rows under a row, shown when it is expanded (e.g. a PO's receipts when it came in several lots). */
export type ReportSubTable = { title: string; columns: ReportColumn[]; rows: ReportRow[] };
export type ReportRow = Record<string, string | number | null | ReportFile[] | ReportSubTable> & { _href?: string | null };
export type ReportData = { columns: ReportColumn[]; rows: ReportRow[]; totals?: ReportRow; note?: string };

export type Range = { from: Date; to: Date };

const ISSUED = Prisma.sql`po.po_number IS NOT NULL AND po.status <> 'CANCELLED'`;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const SPEND_GROUPS = {
  vendor: { label: "Vendor", expr: Prisma.sql`v.name` },
  category: { label: "Category", expr: Prisma.sql`COALESCE(i.category, 'Uncategorised')` },
  department: { label: "Department", expr: Prisma.sql`COALESCE(ind.department, 'Not stated')` },
  item: { label: "Item", expr: Prisma.sql`i.name` },
  month: { label: "Month", expr: Prisma.sql`to_char(po.po_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')` },
} as const;
export type SpendGroup = keyof typeof SPEND_GROUPS;

/** Spend on issued POs (incl. GST) grouped by vendor / category / department / item / month. */
export async function spendReport(range: Range, by: SpendGroup): Promise<ReportData> {
  const g = SPEND_GROUPS[by];
  const rows = await db.$queryRaw<{ key: string; pos: bigint; lines: bigint; taxable: number; total: number }[]>`
    SELECT ${g.expr} AS key, count(DISTINCT po.id) AS pos, count(*) AS lines,
           sum(pi.taxable_amount)::float8 AS taxable, sum(pi.line_total)::float8 AS total
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    JOIN vendors v ON v.id = po.vendor_id
    JOIN items i ON i.id = pi.item_id
    LEFT JOIN indents ind ON ind.id = po.indent_id
    WHERE ${ISSUED} AND po.po_date >= ${range.from} AND po.po_date < ${range.to}
    GROUP BY 1
    ORDER BY ${by === "month" ? Prisma.sql`1` : Prisma.sql`5 DESC`}`;
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return {
    columns: [
      { key: "key", label: g.label },
      { key: "pos", label: "POs", type: "number" },
      { key: "lines", label: "Lines", type: "number" },
      { key: "taxable", label: "Taxable value", type: "money" },
      { key: "total", label: "Value incl. GST", type: "money" },
      { key: "share", label: "Share", type: "pct" },
    ],
    rows: rows.map((r) => ({
      key: r.key,
      pos: Number(r.pos),
      lines: Number(r.lines),
      taxable: r2(r.taxable),
      total: r2(r.total),
      share: grand ? r2((r.total / grand) * 100) : 0,
    })),
    totals: {
      key: "Total",
      pos: null,
      lines: rows.reduce((s, r) => s + Number(r.lines), 0),
      taxable: r2(rows.reduce((s, r) => s + r.taxable, 0)),
      total: r2(grand),
      share: 100,
    },
  };
}

/** PO copy / generated PDF first, then bilties, invoices, certificates; each opens the stored file. */
export function fileKind(d: { type: string; grnId: number | null }): ReportFile["kind"] {
  if (d.type === "PO_PDF" || (d.type === "OTHER" && d.grnId === null)) return "PO";
  if (d.type === "BILTY") return "BILTY";
  if (d.type === "INVOICE") return "INVOICE";
  if (d.type === "QUALITY_CERT") return "CERT";
  return "OTHER";
}
const KIND_ORDER: ReportFile["kind"][] = ["PO", "BILTY", "INVOICE", "CERT", "OTHER"];

export async function poRegister(range: Range): Promise<ReportData> {
  const pos = await db.purchaseOrder.findMany({
    where: { poNumber: { not: null }, poDate: { gte: range.from, lt: range.to } },
    orderBy: { poDate: "desc" },
    select: {
      id: true,
      poNumber: true,
      poDate: true,
      status: true,
      revision: true,
      grandTotal: true,
      expectedDeliveryDate: true,
      vendor: { select: { name: true } },
      indent: { select: { indentNumber: true, department: true } },
      items: { select: { quantity: true, quantityReceived: true } },
      documents: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, grnId: true, fileName: true } },
      // Each delivery (lot) with its own invoice / bilty: listed under the PO when there are several.
      goodsReceipts: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          grnNumber: true,
          receivedAt: true,
          invoiceNo: true,
          invoiceDate: true,
          invoiceAmount: true,
          biltyNo: true,
          status: true,
          items: { select: { receivedQty: true, acceptedQty: true, poItem: { select: { description: true, uom: true } } } },
        },
      },
    },
  });
  const fileOf = (d: { id: number; type: string; grnId: number | null; fileName: string }): ReportFile => ({ kind: fileKind(d), name: d.fileName, href: `/api/documents/${d.id}` });
  const lots = (p: (typeof pos)[number]): ReportSubTable | null =>
    p.goodsReceipts.length < 2
      ? null
      : {
          title: `${p.goodsReceipts.length} deliveries`,
          columns: [
            { key: "grn", label: "Receipt" },
            { key: "received", label: "Received on", type: "date" },
            { key: "items", label: "Items received" },
            { key: "invoice", label: "Invoice no." },
            { key: "invoiceDate", label: "Invoice date", type: "date" },
            { key: "amount", label: "Invoice amount", type: "money" },
            { key: "bilty", label: "Bilty / LR" },
            { key: "files", label: "Files", type: "files" },
            { key: "status", label: "Status" },
          ],
          rows: p.goodsReceipts.map((g) => ({
            _href: `/goods-receipts/${g.id}`,
            grn: g.grnNumber,
            received: iso(g.receivedAt),
            items: g.items.map((l) => `${l.poItem.description} ${toNumber(l.acceptedQty ?? l.receivedQty)} ${l.poItem.uom}`).join(", "),
            invoice: g.invoiceNo,
            invoiceDate: iso(g.invoiceDate),
            amount: g.invoiceAmount === null ? null : toNumber(g.invoiceAmount),
            bilty: g.biltyNo,
            files: p.documents.filter((d) => d.grnId === g.id).map(fileOf).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
            status: g.status.replace("_", " ").toLowerCase(),
          })),
        };
  return {
    columns: [
      { key: "po", label: "PO no." },
      { key: "files", label: "Attachments", type: "files" },
      { key: "date", label: "PO date", type: "date" },
      { key: "vendor", label: "Vendor" },
      { key: "indent", label: "Indent" },
      { key: "department", label: "Department" },
      { key: "value", label: "Value", type: "money" },
      { key: "due", label: "Delivery by", type: "date" },
      { key: "received", label: "Received", type: "pct" },
      { key: "lots", label: "Lots", type: "number" },
      { key: "status", label: "Status" },
    ],
    rows: pos.map((p) => {
      const qty = p.items.reduce((s, l) => s + toNumber(l.quantity), 0);
      const rec = p.items.reduce((s, l) => s + toNumber(l.quantityReceived), 0);
      return {
        _href: `/purchase-orders/${p.id}`,
        po: p.revision ? `${p.poNumber} Rev.${p.revision}` : p.poNumber,
        date: iso(p.poDate),
        vendor: p.vendor.name,
        indent: p.indent?.indentNumber ?? null,
        department: p.indent?.department ?? null,
        value: toNumber(p.grandTotal),
        due: iso(p.expectedDeliveryDate),
        received: qty ? r2(Math.min(100, (rec / qty) * 100)) : 0,
        lots: p.goodsReceipts.length,
        status: p.status.replace("_", " ").toLowerCase(),
        files: p.documents.map(fileOf).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
        _sub: lots(p),
      };
    }),
    totals: { po: "Total", value: r2(pos.reduce((s, p) => s + toNumber(p.grandTotal), 0)) },
  };
}

/** Quantity still to come on open POs, most overdue first. */
export async function pendingLines(): Promise<ReportData> {
  const lines = await db.poItem.findMany({
    where: { po: { status: { in: ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"] } } },
    select: {
      description: true,
      uom: true,
      quantity: true,
      quantityReceived: true,
      rate: true,
      discountPct: true,
      po: { select: { id: true, poNumber: true, poDate: true, expectedDeliveryDate: true, vendor: { select: { name: true } } } },
    },
  });
  const today = Date.now();
  const rows = lines
    .map((l) => {
      const pending = toNumber(l.quantity) - toNumber(l.quantityReceived);
      const due = l.po.expectedDeliveryDate;
      return {
        _href: `/purchase-orders/${l.po.id}`,
        po: l.po.poNumber,
        poDate: iso(l.po.poDate),
        vendor: l.po.vendor.name,
        item: l.description,
        uom: l.uom,
        ordered: toNumber(l.quantity),
        received: toNumber(l.quantityReceived),
        pending,
        value: r2(pending * netRate(toNumber(l.rate), toNumber(l.discountPct))),
        due: iso(due),
        late: due ? Math.max(0, Math.floor((today - due.getTime()) / 86_400_000)) : null,
      };
    })
    .filter((r) => r.pending > 0)
    .sort((a, b) => (b.late ?? -1) - (a.late ?? -1));
  return {
    columns: [
      { key: "po", label: "PO no." },
      { key: "poDate", label: "PO date", type: "date" },
      { key: "vendor", label: "Vendor" },
      { key: "item", label: "Item" },
      { key: "uom", label: "Unit" },
      { key: "ordered", label: "Ordered", type: "number" },
      { key: "received", label: "Received", type: "number" },
      { key: "pending", label: "Pending", type: "number" },
      { key: "value", label: "Pending value (excl. GST)", type: "money" },
      { key: "due", label: "Due", type: "date" },
      { key: "late", label: "Days late", type: "number" },
    ],
    rows,
    totals: { po: "Total", value: r2(rows.reduce((s, r) => s + r.value, 0)) },
  };
}

export async function grnRegister(range: Range): Promise<ReportData> {
  const grns = await db.goodsReceipt.findMany({
    where: { receivedAt: { gte: range.from, lt: range.to } },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      grnNumber: true,
      receivedAt: true,
      status: true,
      invoiceNo: true,
      invoiceAmount: true,
      biltyNo: true,
      po: { select: { poNumber: true, expectedDeliveryDate: true } },
      vendor: { select: { name: true } },
      items: { select: { qtyCheck: true, qualityCheck: true, rejectedQty: true } },
      bill: { select: { billNumber: true } },
    },
  });
  return {
    columns: [
      { key: "grn", label: "GRN no." },
      { key: "date", label: "Received", type: "date" },
      { key: "po", label: "PO no." },
      { key: "vendor", label: "Vendor" },
      { key: "invoice", label: "Invoice" },
      { key: "invoiceAmount", label: "Invoice amount", type: "money" },
      { key: "bilty", label: "Bilty / LR" },
      { key: "late", label: "Days late", type: "number" },
      { key: "failed", label: "Lines failed", type: "number" },
      { key: "status", label: "Status" },
      { key: "bill", label: "Bill" },
    ],
    rows: grns.map((g) => ({
      _href: `/goods-receipts/${g.id}`,
      grn: g.grnNumber,
      date: iso(g.receivedAt),
      po: g.po.poNumber,
      vendor: g.vendor.name,
      invoice: g.invoiceNo,
      invoiceAmount: g.invoiceAmount === null ? null : toNumber(g.invoiceAmount),
      bilty: g.biltyNo,
      late: g.po.expectedDeliveryDate ? Math.max(0, Math.round((g.receivedAt.getTime() - g.po.expectedDeliveryDate.getTime()) / 86_400_000)) : null,
      failed: g.items.filter((l) => l.qtyCheck === "FAIL" || l.qualityCheck === "FAIL").length,
      status: g.status === "PENDING_QC" ? "pending check" : g.status.toLowerCase(),
      bill: g.bill?.billNumber ?? null,
    })),
  };
}

/** Negotiation savings per approved indent line: chosen rate vs highest / average quote and vs the last PO rate. */
export async function savingsReport(range: Range): Promise<ReportData> {
  const rows = await db.$queryRaw<
    {
      indent_id: number;
      indent_number: string;
      approved_at: Date;
      item_id: number;
      item: string;
      uom: string;
      quantity: number;
      vendor: string;
      quotes: bigint;
      selected: number;
      highest: number;
      average: number;
      last_rate: number | null;
      last_uom: string | null;
    }[]
  >`
    SELECT ind.id AS indent_id, ind.indent_number, ind.approved_at, ii.item_id, i.name AS item, ii.uom, ii.quantity::float8 AS quantity, v.name AS vendor,
           (SELECT count(*) FROM quotation_items q WHERE q.indent_item_id = ii.id) AS quotes,
           (sq.rate * (1 - sq.discount_pct / 100))::float8 AS selected,
           (SELECT max(q.rate * (1 - q.discount_pct / 100)) FROM quotation_items q WHERE q.indent_item_id = ii.id)::float8 AS highest,
           (SELECT avg(q.rate * (1 - q.discount_pct / 100)) FROM quotation_items q WHERE q.indent_item_id = ii.id)::float8 AS average,
           lp.rate AS last_rate, lp.uom AS last_uom
    FROM indent_items ii
    JOIN indents ind ON ind.id = ii.indent_id
    JOIN items i ON i.id = ii.item_id
    JOIN quotation_items sq ON sq.id = ii.selected_quote_item_id
    JOIN quotations qq ON qq.id = sq.quotation_id
    JOIN vendors v ON v.id = qq.vendor_id
    LEFT JOIN LATERAL (
      SELECT (pi.rate * (1 - pi.discount_pct / 100))::float8 AS rate, pi.uom
      FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
      WHERE pi.item_id = ii.item_id AND ${ISSUED} AND po.po_date < ind.approved_at AND pi.rate > 0
      ORDER BY po.po_date DESC LIMIT 1
    ) lp ON true
    WHERE ind.status IN ('APPROVED', 'ORDERED') AND ind.approved_at >= ${range.from} AND ind.approved_at < ${range.to}
    ORDER BY ind.approved_at DESC`;
  const units = await loadUnitItems(rows.filter((r) => r.last_uom && !sameUnit(r.last_uom, r.uom)).map((r) => r.item_id));
  // Last PO rate per the indent line's unit: ₹/Kg on the PO becomes ₹/Bag when the indent is in Bag.
  const lastRate = (r: (typeof rows)[number]) => {
    if (r.last_rate === null || !r.last_uom) return null;
    if (sameUnit(r.last_uom, r.uom)) return r.last_rate;
    const item = units.get(r.item_id);
    const fPo = item ? unitFactor(item, r.last_uom) : null;
    const fLine = item ? unitFactor(item, r.uom) : null;
    return fPo && fLine ? (r.last_rate / fPo) * fLine : null;
  };
  const data = rows.map((r) => ({
    _href: `/indents/${r.indent_id}#comparison`,
    indent: r.indent_number,
    approved: iso(r.approved_at),
    item: r.item,
    vendor: r.vendor,
    quotes: Number(r.quotes),
    qty: r.quantity,
    uom: r.uom,
    selected: r2(r.selected),
    highest: r2(r.highest),
    average: r2(r.average),
    lastRate: lastRate(r) === null ? null : r2(lastRate(r)!),
    vsHighest: r2((r.highest - r.selected) * r.quantity),
    vsLast: lastRate(r) === null ? null : r2((lastRate(r)! - r.selected) * r.quantity),
  }));
  return {
    columns: [
      { key: "indent", label: "Indent" },
      { key: "approved", label: "Approved", type: "date" },
      { key: "item", label: "Item" },
      { key: "vendor", label: "Chosen vendor" },
      { key: "quotes", label: "Quotes", type: "number" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "uom", label: "Unit" },
      { key: "selected", label: "Chosen rate", type: "money" },
      { key: "highest", label: "Highest quote", type: "money" },
      { key: "average", label: "Average quote", type: "money" },
      { key: "lastRate", label: "Last PO rate", type: "money" },
      { key: "vsHighest", label: "Saved vs highest", type: "money" },
      { key: "vsLast", label: "Saved vs last PO", type: "money" },
    ],
    rows: data,
    totals: {
      indent: "Total",
      vsHighest: r2(data.reduce((s, r) => s + r.vsHighest, 0)),
      vsLast: r2(data.reduce((s, r) => s + (r.vsLast ?? 0), 0)),
    },
    note: "Rates net of discount, before GST, per the indent's unit (the last PO rate is converted to it; blank when no conversion is set up). Negative “saved vs last PO” means the item cost more than last time.",
  };
}

/**
 * Rate movement per item across POs in the period, per the item's own unit: lines ordered in another
 * unit are converted (₹/Kg → ₹/Bag). Lines with no rate recorded (₹0, e.g. imported from the FMS
 * sheet) count towards the quantity but not the rates; lines in a unit with no conversion are left out.
 */
export async function priceVariance(range: Range): Promise<ReportData> {
  const lines = await db.$queryRaw<{ item_id: number; item: string; uom: string; line_uom: string; r: number; q: number; d: Date }[]>`
    SELECT pi.item_id, i.name AS item, i.uom, pi.uom AS line_uom,
           (pi.rate * (1 - pi.discount_pct / 100))::float8 AS r, pi.quantity::float8 AS q, po.po_date AS d
    FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id JOIN items i ON i.id = pi.item_id
    WHERE ${ISSUED} AND po.po_date >= ${range.from} AND po.po_date < ${range.to}
    ORDER BY i.name, po.po_date, pi.id`;
  const units = await loadUnitItems(lines.filter((l) => !sameUnit(l.line_uom, l.uom)).map((l) => l.item_id));

  type Acc = { item: string; uom: string; n: number; qty: number; rates: number[]; skipped: Map<string, number> };
  const byItem = new Map<number, Acc>();
  for (const l of lines) {
    const acc: Acc = byItem.get(l.item_id) ?? { item: l.item, uom: l.uom, n: 0, qty: 0, rates: [], skipped: new Map() };
    byItem.set(l.item_id, acc);
    acc.n++;
    const unit = units.get(l.item_id);
    const f = sameUnit(l.line_uom, l.uom) ? 1 : unit ? unitFactor(unit, l.line_uom) : null;
    if (f === null) {
      acc.skipped.set(l.line_uom, (acc.skipped.get(l.line_uom) ?? 0) + l.q);
      continue;
    }
    acc.qty += l.q * f;
    if (l.r > 0) acc.rates.push(l.r / f); // ordered by date
  }

  const rows = [...byItem.entries()].map(([itemId, a]) => {
    const first = a.rates[0] ?? null;
    const last = a.rates.at(-1) ?? null;
    return {
      _href: `/items/${itemId}`,
      item: a.item,
      uom: a.uom,
      pos: a.n,
      qty: r2(a.qty),
      notConverted: [...a.skipped].map(([u, q]) => `${r2(q)} ${u}`).join(", ") || null,
      first: first === null ? null : r2(first),
      last: last === null ? null : r2(last),
      change: first && last !== null ? r2(((last - first) / first) * 100) : null,
      min: a.rates.length ? r2(Math.min(...a.rates)) : null,
      max: a.rates.length ? r2(Math.max(...a.rates)) : null,
      avg: a.rates.length ? r2(a.rates.reduce((s, x) => s + x, 0) / a.rates.length) : null,
    };
  });
  const anySkipped = rows.some((r) => r.notConverted);
  return {
    columns: [
      { key: "item", label: "Item" },
      { key: "uom", label: "Unit" },
      { key: "pos", label: "PO lines", type: "number" },
      { key: "qty", label: "Qty bought", type: "number" },
      ...(anySkipped ? [{ key: "notConverted", label: "Not converted" }] : []),
      { key: "first", label: "First rate", type: "money" },
      { key: "last", label: "Latest rate", type: "money" },
      { key: "change", label: "Change", type: "pct" },
      { key: "min", label: "Lowest", type: "money" },
      { key: "max", label: "Highest", type: "money" },
      { key: "avg", label: "Average", type: "money" },
    ],
    rows,
    note: `Quantities and rates in each item's own unit; lines ordered in another unit are converted. PO lines with no rate (₹0) count in the quantity only.${
      anySkipped ? " “Not converted”: lines in a unit with no conversion yet — add it under Import from Excel → Unit conversions." : ""
    }`,
  };
}

export async function vendorScorecard(range: Range): Promise<ReportData> {
  const [vendors, spend, perf] = await Promise.all([
    db.vendor.findMany({ where: { active: true }, select: { id: true, name: true, msme: true, certification: true } }),
    db.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: { poNumber: { not: null }, status: { not: "CANCELLED" }, poDate: { gte: range.from, lt: range.to } },
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    vendorPerformance(),
  ]);
  const spendBy = new Map(spend.map((s) => [s.vendorId, s]));
  return {
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "msme", label: "MSME" },
      { key: "pos", label: "POs in period", type: "number" },
      { key: "value", label: "Value in period", type: "money" },
      { key: "receipts", label: "Receipts (12 m)", type: "number" },
      { key: "onTime", label: "On time", type: "pct" },
      { key: "delay", label: "Avg delay (days)", type: "number" },
      { key: "rejection", label: "Rejection", type: "pct" },
      { key: "openIssues", label: "Open issues", type: "number" },
      { key: "issues", label: "Issues (all)", type: "number" },
    ],
    rows: vendors
      .map((v) => {
        const s = spendBy.get(v.id);
        const p = perf.get(v.id);
        return {
          _href: `/vendors/${v.id}`,
          vendor: v.name,
          msme: v.msme ? "Yes" : "",
          pos: s?._count._all ?? 0,
          value: toNumber(s?._sum.grandTotal),
          receipts: p?.receipts ?? 0,
          onTime: p?.onTimePct ?? null,
          delay: p?.avgDelayDays ?? null,
          rejection: p?.rejectionPct ?? null,
          openIssues: p?.openIssues ?? 0,
          issues: p?.totalIssues ?? 0,
        };
      })
      .filter((r) => r.pos > 0 || r.receipts > 0 || r.issues > 0)
      .sort((a, b) => b.value - a.value),
    note: "On time, delay and rejection are from completed goods receipts of the last 12 months.",
  };
}

/** Outstanding on passed bills per vendor, by age past the due date. */
export async function payablesAgeing(): Promise<ReportData> {
  const bills = await db.bill.findMany({
    where: { status: "PASSED", paymentStatus: { not: "PAID" } },
    select: { payableAmount: true, paidAmount: true, dueDate: true, msme: true, vendor: { select: { id: true, name: true } } },
  });
  const now = Date.now();
  const map = new Map<number, ReportRow & { vendor: string }>();
  for (const b of bills) {
    const out = toNumber(b.payableAmount) - toNumber(b.paidAmount);
    const late = Math.floor((now - b.dueDate.getTime()) / 86_400_000);
    const bucket = late <= 0 ? "notDue" : late <= 30 ? "d30" : late <= 60 ? "d60" : late <= 90 ? "d90" : "d90plus";
    const row = map.get(b.vendor.id) ?? { _href: `/vendors/${b.vendor.id}`, vendor: b.vendor.name, msme: b.msme ? "Yes" : "", notDue: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
    row[bucket] = r2((row[bucket] as number) + out);
    row.total = r2((row.total as number) + out);
    if (b.msme) row.msme = "Yes";
    map.set(b.vendor.id, row);
  }
  const rows = [...map.values()].sort((a, b) => (b.total as number) - (a.total as number));
  const sum = (k: string) => r2(rows.reduce((s, r) => s + (r[k] as number), 0));
  return {
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "msme", label: "MSME" },
      { key: "notDue", label: "Not due", type: "money" },
      { key: "d30", label: "1–30 days late", type: "money" },
      { key: "d60", label: "31–60", type: "money" },
      { key: "d90", label: "61–90", type: "money" },
      { key: "d90plus", label: "90+", type: "money" },
      { key: "total", label: "Outstanding", type: "money" },
    ],
    rows,
    totals: { vendor: "Total", notDue: sum("notDue"), d30: sum("d30"), d60: sum("d60"), d90: sum("d90"), d90plus: sum("d90plus"), total: sum("total") },
  };
}
