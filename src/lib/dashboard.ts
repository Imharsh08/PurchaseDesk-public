import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dateFormatter } from "@/lib/format";
import { isAdmin } from "@/lib/roles";

/**
 * Dashboard data in two round trips: every number in one SQL statement, every list in another
 * (UNION ALL of small, limited lists). Keeps the home page fast on Workers + Hyperdrive.
 */

const ISSUED = `('APPROVED','SENT','ACKNOWLEDGED','PARTIALLY_RECEIVED','COMPLETED')`;
const OPEN = `('APPROVED','SENT','ACKNOWLEDGED','PARTIALLY_RECEIVED')`;

/** IST calendar boundaries. */
export function periods(now = new Date()) {
  const [y, m, d] = dateFormatter("en-CA", {}).format(now).split("-").map(Number);
  const istMidnight = (year: number, month: number, day = 1) => new Date(Date.UTC(year, month - 1, day) - 330 * 60_000);
  const iso = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return {
    today: iso(y, m, d),
    in7: iso(y, m, d + 7),
    monthDate: iso(y, m, 1),
    month: istMidnight(y, m),
    fy: istMidnight(m >= 4 ? y : y - 1, 4),
    since90: new Date(now.getTime() - 90 * 86_400_000),
  };
}

export type DashboardStats = {
  po_pending_approval: number;
  po_to_issue_send: number;
  open_value: number;
  overdue_pos: number;
  month_value: number;
  month_pos: number;
  fy_value: number;
  collecting: number;
  short_of_quotes: number;
  comparisons_pending: number;
  amendments_pending: number;
  bills_to_pass: number;
  open_issues: number;
  below_min: number;
  days_indent_to_po: number | null;
  days_po_to_receipt: number | null;
  days_indent_to_receipt: number | null;
  deliveries_with_due: number;
  deliveries_on_time: number;
};

export async function dashboardStats(): Promise<DashboardStats> {
  const p = periods();
  const [row] = await db.$queryRawUnsafe<DashboardStats[]>(
    `
    WITH first_receipt AS (
      SELECT po_id, min(created_at) AS at FROM goods_receipts WHERE status <> 'CANCELLED' GROUP BY po_id
    ), recent_po AS (
      SELECT po.id, po.po_date, i.submitted_at, fr.at AS received_at
      FROM purchase_orders po
      LEFT JOIN indents i ON i.id = po.indent_id
      LEFT JOIN first_receipt fr ON fr.po_id = po.id
      WHERE po.po_number IS NOT NULL AND po.status <> 'CANCELLED' AND po.po_date >= $4
    )
    SELECT
      (SELECT count(*)::int FROM purchase_orders WHERE status = 'PENDING_APPROVAL') AS po_pending_approval,
      (SELECT count(*)::int FROM purchase_orders WHERE status = 'APPROVED' OR (status = 'DRAFT' AND quotation_id IS NOT NULL)) AS po_to_issue_send,
      (SELECT coalesce(sum(grand_total), 0)::float8 FROM purchase_orders WHERE status IN ${OPEN}) AS open_value,
      (SELECT count(*)::int FROM purchase_orders WHERE status IN ${OPEN} AND expected_delivery_date < $1::date) AS overdue_pos,
      (SELECT coalesce(sum(grand_total), 0)::float8 FROM purchase_orders WHERE status IN ${ISSUED} AND po_date >= $2) AS month_value,
      (SELECT count(*)::int FROM purchase_orders WHERE status IN ${ISSUED} AND po_date >= $2) AS month_pos,
      (SELECT coalesce(sum(grand_total), 0)::float8 FROM purchase_orders WHERE status IN ${ISSUED} AND po_date >= $3) AS fy_value,
      (SELECT count(*)::int FROM indents WHERE status = 'OPEN') AS collecting,
      (SELECT count(*)::int FROM indents i WHERE i.status = 'OPEN' AND (SELECT count(*) FROM quotations q WHERE q.indent_id = i.id) < 3) AS short_of_quotes,
      (SELECT count(*)::int FROM indents WHERE status = 'PENDING_APPROVAL') AS comparisons_pending,
      (SELECT count(*)::int FROM po_amendments WHERE status = 'PENDING') AS amendments_pending,
      (SELECT count(*)::int FROM bills WHERE status = 'ENTERED') AS bills_to_pass,
      (SELECT count(*)::int FROM vendor_issues WHERE status = 'OPEN') AS open_issues,
      (SELECT count(*)::int FROM items WHERE active AND min_stock IS NOT NULL AND current_stock IS NOT NULL AND current_stock < min_stock) AS below_min,
      (SELECT (avg(extract(epoch FROM po_date - submitted_at)) / 86400)::float8 FROM recent_po WHERE submitted_at IS NOT NULL) AS days_indent_to_po,
      (SELECT (avg(extract(epoch FROM received_at - po_date)) / 86400)::float8 FROM recent_po WHERE received_at IS NOT NULL) AS days_po_to_receipt,
      (SELECT (avg(extract(epoch FROM received_at - submitted_at)) / 86400)::float8 FROM recent_po WHERE received_at IS NOT NULL AND submitted_at IS NOT NULL) AS days_indent_to_receipt,
      (SELECT count(*)::int FROM goods_receipts g JOIN purchase_orders po ON po.id = g.po_id
         WHERE g.status <> 'CANCELLED' AND g.received_at >= $5::date AND po.expected_delivery_date IS NOT NULL) AS deliveries_with_due,
      (SELECT count(*)::int FROM goods_receipts g JOIN purchase_orders po ON po.id = g.po_id
         WHERE g.status <> 'CANCELLED' AND g.received_at >= $5::date AND g.received_at <= po.expected_delivery_date) AS deliveries_on_time
    `,
    p.today,
    p.month,
    p.fy,
    p.since90,
    p.monthDate,
  );
  return row;
}

export type ListRow = {
  kind: "recent" | "overdue" | "topv" | "quotes" | "compare" | "ready" | "poact" | "qc" | "amend" | "msme";
  id: number;
  num: string | null;
  party: string | null;
  status: string | null;
  amount: number | null;
  at: Date | null;
  n: number | null;
  ref_id: number | null;
  detail: string | null;
};

export async function dashboardLists(user: { id: number; roles: readonly Role[] }) {
  const p = periods();
  const rows = await db.$queryRawUnsafe<ListRow[]>(
    `
    (SELECT 'recent' AS kind, po.id, po.po_number AS num, v.name AS party, po.status::text AS status, po.grand_total::float8 AS amount,
            po.updated_at::timestamp AS at, po.revision AS n, NULL::int AS ref_id, NULL::text AS detail
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id ORDER BY po.updated_at DESC LIMIT 6)
    UNION ALL
    (SELECT 'overdue', po.id, po.po_number, v.name, po.status::text, po.grand_total::float8, po.expected_delivery_date::timestamp, NULL, NULL, NULL
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
      WHERE po.status IN ${OPEN} AND po.expected_delivery_date < $1::date ORDER BY po.expected_delivery_date LIMIT 5)
    UNION ALL
    (SELECT 'topv', v.id, NULL, v.name, NULL, sum(po.grand_total)::float8, NULL, count(*)::int, NULL, NULL
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
      WHERE po.status IN ${ISSUED} AND po.po_date >= $2 GROUP BY v.id, v.name ORDER BY 6 DESC LIMIT 5)
    UNION ALL
    (SELECT 'quotes', i.id, i.indent_number,
            (SELECT ii.description FROM indent_items ii WHERE ii.indent_id = i.id ORDER BY ii.line_no LIMIT 1),
            i.priority::text, NULL, i.required_by::timestamp, (SELECT count(*)::int FROM quotations q WHERE q.indent_id = i.id), NULL, NULL
       FROM indents i WHERE i.status = 'OPEN' ORDER BY (i.priority = 'URGENT') DESC, i.submitted_at LIMIT 6)
    UNION ALL
    (SELECT 'compare', i.id, i.indent_number, u.name, i.priority::text, i.comparison_value::float8, i.comparison_submitted_at,
            (SELECT count(*)::int FROM quotations q WHERE q.indent_id = i.id), NULL, NULL
       FROM indents i LEFT JOIN users u ON u.id = i.comparison_submitted_by
      WHERE i.status = 'PENDING_APPROVAL' AND ($3::boolean OR i.comparison_submitted_by IS DISTINCT FROM $4)
      ORDER BY i.comparison_submitted_at LIMIT 5)
    UNION ALL
    (SELECT 'ready', i.id, i.indent_number, NULL, NULL, NULL, i.approved_at, NULL, NULL, NULL
       FROM indents i WHERE i.status = 'APPROVED' ORDER BY i.approved_at LIMIT 5)
    UNION ALL
    (SELECT 'poact', po.id, po.po_number, v.name, po.status::text, po.grand_total::float8, po.updated_at, NULL, NULL, NULL
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
      WHERE (po.status = 'DRAFT' AND po.quotation_id IS NOT NULL) OR po.status IN ('APPROVED', 'PENDING_APPROVAL')
      ORDER BY po.updated_at LIMIT 8)
    UNION ALL
    (SELECT 'qc', g.id, g.grn_number, v.name, NULL, NULL, g.received_at::timestamp, (SELECT count(*)::int FROM goods_receipt_items gi WHERE gi.grn_id = g.id), NULL, NULL
       FROM goods_receipts g JOIN vendors v ON v.id = g.vendor_id WHERE g.status = 'PENDING_QC' ORDER BY g.received_at LIMIT 5)
    UNION ALL
    (SELECT 'amend', a.id, po.po_number, v.name, NULL, a.new_total::float8, a.requested_at, a.revision_no, po.id, a.old_total::text
       FROM po_amendments a JOIN purchase_orders po ON po.id = a.po_id JOIN vendors v ON v.id = po.vendor_id
      WHERE a.status = 'PENDING' AND ($3::boolean OR a.requested_by <> $4) ORDER BY a.requested_at LIMIT 5)
    UNION ALL
    (SELECT 'msme', b.id, b.bill_number, v.name, NULL, (b.payable_amount - b.paid_amount)::float8, b.due_date::timestamp, NULL, NULL, NULL
       FROM bills b JOIN vendors v ON v.id = b.vendor_id
      WHERE b.status = 'PASSED' AND b.payment_status <> 'PAID' AND b.msme AND b.due_date <= $5::date ORDER BY b.due_date LIMIT 5)
    `,
    p.today,
    p.fy,
    isAdmin(user.roles),
    user.id,
    p.in7,
  );
  const of = <K extends ListRow["kind"]>(kind: K) => rows.filter((r) => r.kind === kind);
  return {
    recent: of("recent"),
    overdue: of("overdue"),
    topVendors: of("topv"),
    collecting: of("quotes"),
    comparisons: of("compare"),
    ready: of("ready"),
    poAct: of("poact"),
    toCheck: of("qc"),
    amendments: of("amend"),
    msmeDue: of("msme"),
  };
}
