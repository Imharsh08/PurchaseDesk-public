import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { dashboardLists, dashboardStats } from "@/lib/dashboard";
import { assignedNames, loadFms } from "@/lib/fms";
import { doerScorecard, overallOnTime, periodRange } from "@/lib/fms-score";
import { FMS_STEPS, canDoStep, resolveTat } from "@/lib/fms-steps";
import { formatDate, formatINR } from "@/lib/format";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { poDisplayNumber } from "@/lib/po-status";
import { getCompany } from "@/lib/purchase-orders";
import { can } from "@/lib/roles";

/**
 * The dashboard: headline numbers, short lists, the FMS overview and "Needs your attention" — the
 * things this person can act on next (so it depends on who is asking).
 */
export async function loadDashboard(user: { id: number; roles: Role[] }) {
  const today = new Date();

  // All in parallel: numbers, lists, the FMS sheet (open rows + this month) and each step's doers.
  const [s, l, fms, assigned] = await Promise.all([
    dashboardStats(),
    dashboardLists(user),
    loadFms({ open: true, days: 62 }),
    getCompany().then((c) => assignedNames(resolveTat(c.tat))),
  ]);

  // ── FMS ──
  const month = periodRange("this-month", today);
  const onTime = overallOnTime(fms.rows, month);
  const overdueByStep = FMS_STEPS.map((st) => ({ ...st, n: fms.rows.filter((r) => r.cells[st.code].state === "overdue" && !r.cells[st.code].shared).length })).filter((x) => x.n);
  const overdueByDoer = doerScorecard(fms.rows, assigned, month).filter((d) => d.overdueNow > 0);
  const isMine = (code: (typeof FMS_STEPS)[number]["code"]) =>
    fms.tat[code].doers.length ? fms.tat[code].doers.includes(user.id) : canDoStep(user.roles, code);
  const myRows = fms.rows.filter((r) => r.current && isMine(r.current));
  const myOverdue = myRows.filter((r) => r.cells[r.current!].state === "overdue").length;
  const totalOverdue = overdueByStep.reduce((sum, x) => sum + x.n, 0);
  const deliveriesPct = s.deliveries_with_due ? Math.round((s.deliveries_on_time / s.deliveries_with_due) * 100) : null;

  // ── "Needs your attention": what this person can act on next ──
  type Todo = { key: string; href: string; title: string; tag: string; tone: string; detail: string; right?: string };
  const todos: Todo[] = [];
  const rose = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  const amber = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  const sky = "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
  if (myOverdue) {
    todos.push({ key: "fms", href: "/fms", title: `${myOverdue} of your FMS step${myOverdue === 1 ? " is" : "s are"} overdue`, tag: "FMS", tone: rose, detail: "Open the FMS tracker → My tasks; each step has a button to do it" });
  }
  if (s.below_min > 0 && (can(user.roles, "updateStock") || can(user.roles, "raiseIndent"))) {
    todos.push({ key: "stock", href: "/stock?view=order", title: `${s.below_min} item${s.below_min === 1 ? "" : "s"} below minimum stock`, tag: "Raise indent", tone: rose, detail: "Open the stock dashboard to see suggested order quantities" });
  }
  if (can(user.roles, "recordPayment")) {
    for (const b of l.msmeDue) {
      const late = !!b.at && b.at.getTime() < today.getTime();
      todos.push({ key: `m${b.id}`, href: `/bills/${b.id}`, title: b.num ?? "", tag: late ? "MSME overdue" : "MSME payment due", tone: rose, detail: `${b.party} · due ${formatDate(b.at)} (45-day rule)`, right: formatINR(b.amount ?? 0) });
    }
  }
  if (can(user.roles, "approvePO")) {
    for (const a of l.amendments) {
      todos.push({ key: `a${a.id}`, href: `/purchase-orders/${a.ref_id}`, title: `${a.num} Rev. ${a.n}`, tag: "Approve amendment", tone: amber, detail: `${a.party} · ${formatINR(Number(a.detail))} → ${formatINR(a.amount ?? 0)}` });
    }
  }
  if (s.bills_to_pass > 0 && can(user.roles, "passBill")) {
    todos.push({ key: "bills", href: "/bills?view=pass", title: `${s.bills_to_pass} bill${s.bills_to_pass === 1 ? "" : "s"} to pass`, tag: "Pass bills", tone: sky, detail: "Matched against PO and goods receipt; check debits and pass for payment" });
  }
  if (can(user.roles, "qualityCheck")) {
    for (const g of l.toCheck) {
      todos.push({ key: `g${g.id}`, href: `/goods-receipts/${g.id}#qc`, title: g.num ?? "", tag: "Quality check", tone: amber, detail: `${g.party} · ${g.n} item${g.n === 1 ? "" : "s"} received ${formatDate(g.at)}` });
    }
  }
  if (s.open_issues > 0 && can(user.roles, "resolveIssue")) {
    todos.push({ key: "issues", href: "/goods-receipts?view=issues", title: `${s.open_issues} open vendor issue${s.open_issues === 1 ? "" : "s"}`, tag: "Follow up", tone: rose, detail: "Short supply, rejections and document problems awaiting resolution" });
  }
  if (can(user.roles, "approveComparison")) {
    for (const c of l.comparisons) {
      todos.push({ key: `c${c.id}`, href: `/indents/${c.id}#comparison`, title: c.num ?? "", tag: "Approve vendor", tone: amber, detail: `${c.n} quotation${c.n === 1 ? "" : "s"} · compared by ${c.party ?? "—"}${c.status === "URGENT" ? " · Urgent" : ""}`, right: c.amount ? formatINR(c.amount) : undefined });
    }
  }
  for (const po of l.poAct) {
    const issue = po.status === "DRAFT";
    const approve = po.status === "PENDING_APPROVAL";
    if (approve ? !can(user.roles, "approvePO") : !can(user.roles, "sendPO")) continue;
    todos.push({ key: `p${po.id}`, href: `/purchase-orders/${po.id}`, title: poDisplayNumber({ id: po.id, poNumber: po.num }), tag: issue ? "Issue PO" : approve ? "Approve PO" : "Send to vendor", tone: sky, detail: po.party ?? "", right: formatINR(po.amount ?? 0) });
  }
  if (can(user.roles, "createPO")) {
    for (const r of l.ready) {
      todos.push({ key: `r${r.id}`, href: `/indents/${r.id}`, title: r.num ?? "", tag: "Create PO", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", detail: `Vendor approved ${formatDate(r.at)}` });
    }
  }
  if (can(user.roles, "manageQuotations")) {
    for (const r of l.collecting) {
      const n = r.n ?? 0;
      todos.push({ key: `o${r.id}`, href: `/indents/${r.id}#quotations`, title: r.num ?? "", tag: n >= MIN_QUOTATIONS ? "Compare & submit" : `${n}/${MIN_QUOTATIONS} quotes`, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", detail: `${r.party ?? ""}${r.at ? ` · needed by ${formatDate(r.at)}` : ""}${r.status === "URGENT" ? " · Urgent" : ""}` });
    }
  }

  const topMax = Math.max(1, ...l.topVendors.map((v) => v.amount ?? 0));
  const awaiting = s.comparisons_pending + s.po_pending_approval + s.amendments_pending;

  // Large screens (≥1280×800): the whole dashboard fits the first screen and long lists scroll inside
  // their card. Smaller screens scroll the page normally instead of squashing the cards.

  return { s, l, onTime, overdueByStep, overdueByDoer, myTaskCount: myRows.length, myOverdue, totalOverdue, deliveriesPct, todos, topMax, awaiting };
}
