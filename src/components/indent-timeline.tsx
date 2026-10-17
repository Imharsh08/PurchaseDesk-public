"use client";

/**
 * Where an indent is now: its FMS steps as a vertical timeline — quotations and approval, then for
 * each PO (and each delivery lot) sending, follow-up, receipt, check, return, storing and bill —
 * each with when it was done and by whom, or when it is due. The current step has its button for
 * users whose role allows it. Built from the same rows as the FMS sheet (src/lib/fms.ts).
 * Folded at first: in each part (the indent, each PO / lot) the step before, the one due and the one
 * after, plus anything overdue; "Show all steps" opens the rest.
 */
import { useState } from "react";
import Link from "@/components/link";
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { FmsCell, FmsRow } from "@/lib/fms";
import { FMS_STEPS, formatHours, type StepCode } from "@/lib/fms-steps";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const step = (code: StepCode) => FMS_STEPS.find((s) => s.code === code)!;
const when = (iso: string | null) => (iso ? formatDateTime(new Date(iso)) : "");

/** The task link without "?from=fms" (that makes the task screen go back to the FMS sheet). */
function taskHref(href: string) {
  const [path, hash] = href.split("#");
  const [base, query = ""] = path.split("?");
  const rest = query.split("&").filter((p) => p && p !== "from=fms");
  return `${base}${rest.length ? `?${rest.join("&")}` : ""}${hash ? `#${hash}` : ""}`;
}

const DOT: Record<FmsCell["state"], string> = {
  done: "bg-emerald-500 text-white ring-emerald-500",
  late: "bg-orange-500 text-white ring-orange-500",
  pending: "bg-sky-50 text-sky-600 ring-sky-400 dark:bg-sky-950",
  overdue: "bg-rose-600 text-white ring-rose-600",
  waiting: "bg-background text-muted-foreground ring-border",
  na: "bg-muted text-muted-foreground ring-border",
};

function Step({ code, cell, current, assigned, canDo, last }: { code: StepCode; cell: FmsCell; current: boolean; assigned: string[]; canDo: boolean; last: boolean }) {
  const s = step(code);
  const Icon = cell.state === "done" || cell.state === "late" ? CheckIcon : cell.state === "overdue" ? AlertTriangleIcon : cell.state === "na" ? MinusIcon : ClockIcon;
  const delay = cell.delayHours;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />}
      <span className={cn("relative z-10 grid size-6 shrink-0 place-items-center rounded-full ring-1", DOT[cell.state], current && "ring-2 ring-offset-2 ring-offset-card")}>
        <Icon className="size-3" />
      </span>
      <div className={cn("min-w-0 flex-1 text-sm", current && "rounded-md bg-primary/5 px-2 py-1 -mx-2 -my-1")}>
        <div className={cn("font-medium leading-6", (cell.state === "waiting" || cell.state === "na") && "text-muted-foreground")}>
          <span className="mr-1 text-xs text-muted-foreground">{code}</span>
          {cell.link && (cell.state === "done" || cell.state === "late") ? (
            <Link href={cell.link} className="hover:text-primary hover:underline">
              {s.short}
            </Link>
          ) : (
            s.short
          )}
          {current && <span className="ml-1.5 text-xs font-semibold text-primary">· Now</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {cell.state === "done" || cell.state === "late" ? (
            <>
              {when(cell.actual)}
              {cell.doer ? ` · ${cell.doer}` : ""}
              {cell.state === "late" && delay !== null && <span className="font-medium text-orange-700 dark:text-orange-400"> · {formatHours(delay)} late</span>}
            </>
          ) : cell.state === "overdue" ? (
            <span className="font-medium text-rose-700 dark:text-rose-400">
              Overdue {delay !== null ? formatHours(delay) : ""} · was due {when(cell.planned)}
            </span>
          ) : cell.state === "pending" ? (
            <span className="text-sky-700 dark:text-sky-400">
              Due {when(cell.planned)}
              {delay !== null ? ` · ${formatHours(-delay)} left` : ""}
            </span>
          ) : cell.state === "na" ? (
            (cell.note ?? "Not applicable")
          ) : (
            "Waiting for the step before"
          )}
        </div>
        {(cell.state === "pending" || cell.state === "overdue") && (
          <div className="text-xs text-muted-foreground">Doer: {assigned.length ? assigned.join(", ") : "anyone allowed"}</div>
        )}
        {cell.note && cell.state !== "na" && <div className="truncate text-xs text-muted-foreground" title={cell.note}>{cell.note}</div>}
        {cell.action && canDo && (
          <Link
            href={taskHref(cell.action.href)}
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 transition-colors",
              cell.state === "overdue" ? "bg-rose-600 text-white ring-rose-700 hover:bg-rose-700" : "bg-background text-primary ring-primary/30 hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {cell.action.label}
            <ArrowRightIcon className="size-3" />
          </Link>
        )}
        {cell.alt && canDo && (
          <Link href={taskHref(cell.alt.href)} className="mt-1.5 ml-2 inline-flex text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {cell.alt.label}
          </Link>
        )}
      </div>
    </li>
  );
}

const isDone = (c: FmsCell) => c.state === "done" || c.state === "late";

/**
 * The steps of one part to show folded: the one due with the step before and after it (skipping
 * steps that don't apply), or, with nothing due here, the last one done; overdue steps always.
 */
export function foldedSteps(codes: StepCode[], cells: Record<StepCode, FmsCell>, current: StepCode | null) {
  const keep = new Set<StepCode>();
  const i = current ? codes.indexOf(current) : -1;
  if (i >= 0) {
    keep.add(codes[i]);
    const before = codes.slice(0, i).reverse().find((c) => cells[c].state !== "na");
    const after = codes.slice(i + 1).find((c) => cells[c].state !== "na");
    if (before) keep.add(before);
    if (after) keep.add(after);
  } else {
    const lastDone = [...codes].reverse().find((c) => isDone(cells[c]));
    keep.add(lastDone ?? codes[0]);
  }
  for (const c of codes) if (cells[c].state === "overdue") keep.add(c);
  return codes.filter((c) => keep.has(c));
}

/** "2 earlier steps" / "3 later steps": opens the full list. */
function More({ n, where, onClick }: { n: number; where: "earlier" | "later"; onClick: () => void }) {
  if (!n) return null;
  return (
    <button type="button" onClick={onClick} className="mb-2 ml-[34px] block text-xs text-muted-foreground hover:text-foreground">
      {where === "earlier" ? "⋮ " : ""}
      {n} {where} step{n === 1 ? "" : "s"}
      {where === "later" ? " ⋮" : ""}
    </button>
  );
}

export function IndentTimeline({
  rows,
  assigned,
  canDo,
  draft,
  highlight,
}: {
  rows: FmsRow[];
  assigned: Record<StepCode, string[]>;
  canDo: Record<StepCode, boolean>;
  /** Not sent to purchase yet (no steps started). */
  draft: boolean;
  /** The row (delivery lot) of the page it is shown on, marked "This receipt". */
  highlight?: string;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{draft ? "A draft: the steps start when it is sent to purchase." : "No steps to show."}</p>;
  }
  const first = rows[0];
  const indentSteps: StepCode[] = ["ST1", "ST2"];
  const poSteps: StepCode[] = ["ST3", "ST4", "ST5", "ST6", "ST7", "ST8", "ST9"];
  const indentCurrent = first.current && indentSteps.includes(first.current) ? first.current : null;

  /** A part's steps, folded or all, with "N earlier / later steps" around the folded ones. */
  const part = (codes: StepCode[], cells: Record<StepCode, FmsCell>, current: StepCode | null) => {
    const shown = all ? codes : foldedSteps(codes, cells, current);
    const before = all ? 0 : codes.indexOf(shown[0]);
    const after = all ? 0 : codes.length - 1 - codes.indexOf(shown[shown.length - 1]);
    return (
      <>
        <More n={before} where="earlier" onClick={() => setAll(true)} />
        <ol>
          {shown.map((code, i) => (
            <Step key={code} code={code} cell={cells[code]} current={current === code} assigned={assigned[code]} canDo={canDo[code]} last={i === shown.length - 1} />
          ))}
        </ol>
        <More n={after} where="later" onClick={() => setAll(true)} />
      </>
    );
  };
  const total = indentSteps.length + rows.reduce((n, r) => n + poSteps.filter((c) => !r.cells[c].shared).length, 0);
  const foldedCount =
    foldedSteps(indentSteps, first.cells, indentCurrent).length +
    rows.reduce((n, r) => n + foldedSteps(poSteps.filter((c) => !r.cells[c].shared), r.cells, r.current).length, 0);

  return (
    <div className="space-y-5">
      <div>{part(indentSteps, first.cells, indentCurrent)}</div>
      {rows.map((r, k) => {
        // Later lots share sending and follow-up with the PO's first lot: only their own steps.
        const codes = poSteps.filter((code) => !r.cells[code].shared);
        // Under a PO's last row: receive another lot (with its own invoice) while the PO is open.
        const lastOfPo = rows[k + 1]?.poId !== r.poId;
        const receive = lastOfPo && r.poId && r.receivable && canDo.ST5;
        return (
          <section key={r.key} className={cn("space-y-2", r.key === highlight && "-mx-2 rounded-lg bg-primary/5 px-2 pb-2 ring-1 ring-primary/20")}>
            <div className="flex flex-wrap items-baseline gap-x-2 border-t pt-3 text-xs">
              {r.poId ? (
                <Link href={`/purchase-orders/${r.poId}`} className="font-semibold text-primary hover:underline">
                  {r.poNumber ?? "Draft PO"}
                </Link>
              ) : (
                <span className="font-semibold">Purchase order</span>
              )}
              {r.vendor && <span className="truncate text-muted-foreground">{r.vendor}</span>}
              {r.lot && <span className="font-medium text-amber-700 dark:text-amber-400">{r.lot}</span>}
              {r.key === highlight && <span className="ml-auto font-semibold text-primary">This receipt</span>}
            </div>
            <div>{part(codes, r.cells, r.current)}</div>
            {receive && (
              <Link
                href={`/goods-receipts/new?po=${r.poId}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
              >
                <PlusIcon className="size-3.5" />
                Receive more / add invoice
              </Link>
            )}
          </section>
        );
      })}
      {total > foldedCount && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {all ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
          {all ? "Show fewer steps" : `Show all steps (${total - foldedCount} more)`}
        </button>
      )}
    </div>
  );
}
