import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/date-range";
import { within } from "@/lib/date-range";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { FMS_STEPS, addTat, endOfDayIST, resolveTat, type StepCode } from "@/lib/fms-steps";
import { RECEIVABLE_PO } from "@/lib/grn";
import { getCompany } from "@/lib/purchase-orders";

export type CellState = "done" | "late" | "pending" | "overdue" | "waiting" | "na";

export type FmsCell = {
  planned: string | null;
  actual: string | null;
  /** Hours late (done late, or overdue now); negative = done early / time left. */
  delayHours: number | null;
  state: CellState;
  doer: string | null;
  note: string | null;
  /** Record to open for this step (view). */
  link: string | null;
  /** Where to go to complete the step when it is due / overdue. */
  action: { href: string; label: string } | null;
  /** Another way to finish the step (the balance of a PO: short close it instead of receiving). */
  alt?: { href: string; label: string };
  /** The same step as on the PO's first row (a later delivery lot): shown as "〃", counted once. */
  shared?: boolean;
};

export type FmsRow = {
  key: string;
  indentId: number;
  indentNumber: string;
  raisedAt: string;
  item: string;
  department: string | null;
  requestedBy: string;
  urgent: boolean;
  poId: number | null;
  poNumber: string | null;
  vendor: string | null;
  /** A PO delivered in lots has a row per lot from ST5 on: "Lot 2", or "Balance" for what is still to come. */
  lot: string | null;
  /** The PO can take another receipt (another lot / invoice). */
  receivable: boolean;
  /**
   * A lot of a partly received PO: where to short close the balance that isn't coming. Shown on each
   * lot (e.g. one waiting at accounts), since filters by step or "My tasks" can hide the Balance row.
   */
  shortClose?: string;
  cells: Record<StepCode, FmsCell>;
  /** First step not yet done (null = complete). */
  current: StepCode | null;
  overdue: boolean;
};

const HOUR = 3_600_000;

/** Adds ?from=fms so the task screen returns to the FMS sheet when done (keeps any #hash last). */
export function fms(href: string) {
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}from=fms${hash ? `#${hash}` : ""}`;
}

/** ST3 covers creating, issuing, sending the PO and getting the vendor's confirmation. */
function st3Action(indentId: number, po: { id: number; status: string } | null) {
  if (!po) return { href: fms(`/indents/${indentId}`), label: "Create PO" };
  const at = (d: string) => fms(`/purchase-orders/${po.id}?do=${d}`);
  switch (po.status) {
    case "DRAFT":
      return { href: at("issue"), label: "Issue PO" };
    case "PENDING_APPROVAL":
      return { href: at("approve"), label: "Approve PO" };
    case "APPROVED":
      return { href: at("send"), label: "Send PO" };
    default:
      return { href: at("ack"), label: "Confirm lead time" };
  }
}

/** Names of each step's assigned doers (empty = anyone whose role allows it). */
export async function assignedNames(tat: Awaited<ReturnType<typeof loadFms>>["tat"]) {
  const ids = [...new Set(FMS_STEPS.flatMap((s) => tat[s.code].doers))];
  const names = new Map(
    ids.length ? (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : [],
  );
  return Object.fromEntries(FMS_STEPS.map((s) => [s.code, tat[s.code].doers.map((id) => names.get(id)).filter((n): n is string => !!n)])) as Record<
    StepCode,
    string[]
  >;
}

/**
 * POs imported from the old FMS Google Sheet carry this "sent to". Once closed, steps the sheet didn't
 * record (quotations, bills…) were done there, so they are not pending here.
 */
export const FMS_IMPORT_SENT_TO = "FMS sheet (imported)";

/** Indents with any FMS step still to do (the default sheet; stays small as history grows). */
const OPEN_WHERE: Prisma.IndentWhereInput = {
  OR: [
    { status: { in: ["OPEN", "PENDING_APPROVAL", "APPROVED"] } },
    { purchaseOrders: { some: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } },
    {
      purchaseOrders: {
        some: {
          status: { not: "CANCELLED" },
          OR: [{ sentTo: null }, { sentTo: { not: FMS_IMPORT_SENT_TO } }],
          goodsReceipts: { some: { status: { not: "CANCELLED" }, OR: [{ status: "PENDING_QC" }, { storedAt: null }, { bill: null }] } },
        },
      },
    },
  ],
};

/**
 * Rows for the FMS sheet: one per indent and PO (an indent split across vendors gives several rows).
 * A PO delivered in lots (9 of 20 now, the rest later) gets a row per lot from receipt on — each lot
 * has its own check, storing and bill — plus a "Balance" row while the rest is still to come.
 * `open`: indents with a step still pending; `days`: everything raised in the last N days. Both = either.
 * `range` (the top-bar date range): everything raised in it, instead of the other two.
 */
export async function loadFms(opts: { open?: boolean; days?: number; range?: DateRange | null; indentId?: number }) {
  const company = await getCompany();
  const tat = resolveTat(company.tat);
  const countSundays = company.tatCountSundays;
  const scope: Prisma.IndentWhereInput[] = [];
  // One indent (its page's timeline).
  if (opts.indentId) scope.push({ id: opts.indentId });
  else if (opts.range) scope.push({ submittedAt: within(opts.range) });
  else {
    if (opts.open) scope.push(OPEN_WHERE);
    if (opts.days) scope.push({ submittedAt: { gte: new Date(Date.now() - opts.days * 86_400_000) } });
  }

  const indents = await db.indent.findMany({
    where: { submittedAt: { not: null }, status: { not: "CANCELLED" }, OR: scope.length ? scope : undefined },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      indentNumber: true,
      status: true,
      priority: true,
      department: true,
      submittedAt: true,
      comparisonSubmittedAt: true,
      approvedAt: true,
      requestedBy: { select: { name: true } },
      comparisonSubmittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: { orderBy: { lineNo: "asc" }, take: 1, select: { description: true } },
      _count: { select: { items: true, quotations: true } },
      purchaseOrders: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          poNumber: true,
          status: true,
          createdAt: true,
          sentAt: true,
          sentTo: true,
          acknowledgedAt: true,
          expectedDispatchDate: true,
          expectedDeliveryDate: true,
          followUpAt: true,
          followUpNote: true,
          dispatchedAt: true,
          dispatchBiltyNo: true,
          vendor: { select: { name: true } },
          sentBy: { select: { name: true } },
          goodsReceipts: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              grnNumber: true,
              createdAt: true,
              qcAt: true,
              returnedAt: true,
              returnNote: true,
              storedAt: true,
              tallyRef: true,
              receivedBy: { select: { name: true } },
              qcBy: { select: { name: true } },
              returnedBy: { select: { name: true } },
              storedBy: { select: { name: true } },
              items: { select: { rejectedQty: true } },
              bill: { select: { id: true, billNumber: true, createdAt: true, createdBy: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const now = Date.now();
  const rows: FmsRow[] = [];

  for (const ind of indents) {
    const urgent = ind.priority === "URGENT";
    const hours = (code: StepCode) => (urgent ? tat[code].urgent : tat[code].normal);
    const pos = ind.purchaseOrders.length ? ind.purchaseOrders : [null];

    for (const po of pos) {
      const lots = po?.goodsReceipts ?? [];
      // Each lot received, then the balance still to come (null) while the PO is only partly received.
      const rowsFor: ((typeof lots)[number] | null)[] = !lots.length ? [null] : po?.status === "PARTIALLY_RECEIVED" ? [...lots, null] : [...lots];
      const lotLabel = (grn: (typeof lots)[number] | null, n: number) => (rowsFor.length < 2 ? null : grn ? `Lot ${n + 1}` : "Balance");
      rowsFor.forEach((grn, n) => {
        const later = n > 0;
        const cells = {} as Record<StepCode, FmsCell>;
        let prevActual: Date | null = ind.submittedAt;

        const cell = (
          code: StepCode,
          actual: Date | null,
          doer: string | null,
          opts: {
            planned?: Date | null;
            na?: boolean;
            note?: string | null;
            base?: Date | null;
            link?: string | null;
            action?: { href: string; label: string } | null;
            alt?: { href: string; label: string };
          } = {},
        ) => {
          if (opts.na) {
            cells[code] = { planned: null, actual: null, delayHours: null, state: "na", doer: null, note: opts.note ?? "Not recorded (PO closed)", link: opts.link ?? null, action: null };
            return;
          }
          const base = opts.base !== undefined ? opts.base : prevActual;
          const planned = opts.planned ?? (base ? addTat(base, hours(code), countSundays) : null);
          let state: CellState;
          let delay: number | null = null;
          if (actual) {
            delay = planned ? (actual.getTime() - planned.getTime()) / HOUR : null;
            state = delay !== null && delay > 0 ? "late" : "done";
          } else if (planned && base) {
            delay = (now - planned.getTime()) / HOUR;
            state = delay > 0 ? "overdue" : "pending";
          } else {
            state = "waiting";
          }
          cells[code] = {
            planned: planned?.toISOString() ?? null,
            actual: actual?.toISOString() ?? null,
            delayHours: delay === null ? null : Math.round(delay * 10) / 10,
            state,
            doer,
            note: opts.note ?? null,
            link: opts.link ?? null,
            action: state === "pending" || state === "overdue" ? (opts.action ?? null) : null,
            ...(opts.alt && (state === "pending" || state === "overdue") ? { alt: opts.alt } : {}),
          };
          prevActual = actual;
        };

        // A closed PO (received / short-closed, incl. ones closed before these steps were tracked)
        // has nothing left to do for steps that were never recorded: show them as not applicable.
        // An ordered indent whose POs were all cancelled is closed too (e.g. orders closed in the FMS sheet).
        const closed = po ? po.status === "COMPLETED" : ind.status === "ORDERED";
        // A closed PO imported from the FMS sheet: everything after receipt (QC, storing, bill) was done there.
        const settled = closed && po?.sentTo === FMS_IMPORT_SENT_TO;
        const indentLink = `/indents/${ind.id}`;
        const poLink = po ? `/purchase-orders/${po.id}` : null;
        const grnLink = grn ? `/goods-receipts/${grn.id}` : null;
        // Once a PO exists, quotations and approval are behind it even if they weren't recorded here.
        cell("ST1", ind.comparisonSubmittedAt, ind.comparisonSubmittedBy?.name ?? null, {
          na: (!!po || closed) && !ind.comparisonSubmittedAt,
          note: (po || closed) && !ind.comparisonSubmittedAt ? "Not recorded" : `${ind._count.quotations} quotation${ind._count.quotations === 1 ? "" : "s"}`,
          link: `${indentLink}#quotations`,
          action: { href: fms(`${indentLink}#quotations`), label: ind._count.quotations >= 3 ? "Compare & submit" : "Add quotation" },
        });
        cell("ST2", ind.approvedAt, ind.approvedBy?.name ?? null, {
          na: (!!po || closed) && !ind.approvedAt,
          note: (po || closed) && !ind.approvedAt ? "Not recorded" : null,
          link: `${indentLink}#comparison`,
          action: { href: fms(`${indentLink}#comparison`), label: "Approve" },
        });
        cell("ST3", po?.acknowledgedAt ?? null, po?.sentBy?.name ?? null, {
          na: closed && !po?.acknowledgedAt,
          link: poLink,
          action: st3Action(ind.id, po),
          // Clock starts at approval; PO creation, issue and sending all fall inside this step.
          note: po?.sentAt ? `Sent ${po.sentAt.toISOString().slice(0, 10)}` : po ? "Not sent yet" : "PO not created",
        });
        const st3 = po?.acknowledgedAt ?? null;
        cell("ST4", po?.dispatchedAt ?? null, null, {
          na: closed && !po?.dispatchedAt,
          planned: po?.expectedDispatchDate ? endOfDayIST(po.expectedDispatchDate) : undefined,
          base: st3,
          link: poLink,
          action: po ? { href: fms(`/purchase-orders/${po.id}?do=dispatch`), label: "Follow up / dispatch" } : null,
          note: [
            po?.expectedDispatchDate ? `Follow up by ${new Date(po.expectedDispatchDate.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)}` : null,
            po?.followUpAt ? `Followed up: ${po.followUpNote ?? ""}` : null,
            po?.dispatchBiltyNo ? `LR ${po.dispatchBiltyNo}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        });
        // Receipt is planned on the PO's delivery date when there is one.
        cell("ST5", grn?.createdAt ?? null, grn?.receivedBy.name ?? null, {
          na: closed && !grn,
          planned: po?.expectedDeliveryDate ? endOfDayIST(po.expectedDeliveryDate) : undefined,
          base: po?.expectedDeliveryDate ? (po.acknowledgedAt ?? po.sentAt ?? null) : (po?.dispatchedAt ?? null),
          link: grnLink,
          action: po ? { href: fms(`/goods-receipts/new?po=${po.id}`), label: later && !grn ? "Receive balance" : "Receive" } : null,
          // The vendor won't send the rest: close the PO with the short quantity instead.
          alt: po && later && !grn && po.status === "PARTIALLY_RECEIVED" ? { href: fms(`/purchase-orders/${po.id}?do=shortclose`), label: "Short close the rest" } : undefined,
          note: grn ? grn.grnNumber : later ? "Rest of the order, still to come" : null,
        });
        cell("ST6", grn?.qcAt ?? null, grn?.qcBy?.name ?? null, {
          na: (closed && !grn) || (settled && !grn?.qcAt),
          link: grnLink,
          action: grn ? { href: fms(`/goods-receipts/${grn.id}#qc`), label: "Do the check" } : null,
        });
        const qcAt = grn?.qcAt ?? null;
        const rejected = !!grn?.items.some((l) => toNumber(l.rejectedQty) > 0);
        if ((qcAt && !rejected) || (closed && !grn) || (settled && !grn?.returnedAt))
          cell("ST7", null, null, { na: true, note: qcAt && !rejected ? "Nothing rejected" : "Not recorded", link: grnLink });
        else
          cell("ST7", grn?.returnedAt ?? null, grn?.returnedBy?.name ?? null, {
            base: qcAt,
            note: grn?.returnNote ?? null,
            link: grnLink,
            action: grn ? { href: fms(`/goods-receipts/${grn.id}?do=return`), label: "Record return" } : null,
          });
        cell("ST8", grn?.storedAt ?? null, grn?.storedBy?.name ?? null, {
          na: (closed && !grn) || (settled && !grn?.storedAt),
          base: qcAt,
          note: grn?.tallyRef ? `Tally ${grn.tallyRef}` : null,
          link: grnLink,
          action: grn ? { href: fms(`/goods-receipts/${grn.id}?do=store`), label: "Mark stored" } : null,
        });
        cell("ST9", grn?.bill?.createdAt ?? null, grn?.bill?.createdBy.name ?? null, {
          na: (closed && !grn) || (settled && !grn?.bill),
          base: grn?.storedAt ?? null,
          note: settled && !grn?.bill ? "Done in FMS sheet" : (grn?.bill?.billNumber ?? null),
          link: grn?.bill ? `/bills/${grn.bill.id}` : grnLink,
          action: grn ? { href: fms(`/bills/new?grn=${grn.id}`), label: "Enter bill" } : null,
        });

        // A later lot shares quotations, approval, sending and dispatch with the PO's first row: shown, not counted again.
        if (later) for (const code of ["ST1", "ST2", "ST3", "ST4"] as const) cells[code] = { ...cells[code], shared: true, action: null };
        const current =
          FMS_STEPS.find((s) => !cells[s.code].shared && cells[s.code].state !== "done" && cells[s.code].state !== "late" && cells[s.code].state !== "na")?.code ?? null;
        rows.push({
          key: `${ind.id}-${po?.id ?? 0}-${grn?.id ?? "rest"}`,
          indentId: ind.id,
          indentNumber: ind.indentNumber,
          raisedAt: ind.submittedAt!.toISOString(),
          item: ind.items[0]?.description + (ind._count.items > 1 ? ` +${ind._count.items - 1}` : ""),
          department: ind.department,
          requestedBy: ind.requestedBy.name,
          urgent,
          poId: po?.id ?? null,
          poNumber: po?.poNumber ?? null,
          vendor: po?.vendor.name ?? null,
          lot: lotLabel(grn, n),
          receivable: !!po && RECEIVABLE_PO.includes(po.status),
          ...(po?.status === "PARTIALLY_RECEIVED" && grn ? { shortClose: fms(`/purchase-orders/${po.id}?do=shortclose`) } : {}),
          cells,
          current,
          overdue: Object.values(cells).some((c) => c.state === "overdue" && !c.shared),
        });
      });
    }
  }
  return { rows, tat, countSundays };
}
