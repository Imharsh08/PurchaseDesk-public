"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "@/components/link";
import {
  ArrowRightIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  DownloadIcon,
  HourglassIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TIME_ZONE } from "@/lib/format";
import { FMS_STEPS, formatHours, type StepCode, type TatSettings } from "@/lib/fms-steps";
import { recordVisit } from "@/lib/nav-history";
import { cn } from "@/lib/utils";
import type { FmsCell, FmsRow } from "@/lib/fms";

const dt = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
const fmt = (iso: string | null) => (iso ? dt.format(new Date(iso)) : "");
const day = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, day: "2-digit", month: "short" });
const fmtDay = (iso: string | null) => (iso ? day.format(new Date(iso)) : "");

const delayText = (c: FmsCell) =>
  c.delayHours === null || c.state === "na"
    ? ""
    : c.delayHours > 0
      ? `+${formatHours(c.delayHours)}`
      : c.state === "pending"
        ? `${formatHours(-c.delayHours)} left`
        : "On time";

/** Everything about a cell, for the hover tooltip of the compact view (native title: cheap on big sheets). */
const cellTitle = (c: FmsCell, assignedTo: string[]) =>
  c.state === "na"
    ? (c.note ?? "Not applicable")
    : [
        c.planned && `Planned: ${fmt(c.planned)}`,
        c.actual && `Actual: ${fmt(c.actual)}`,
        delayText(c) && `Delay: ${delayText(c)}`,
        c.doer ? `By: ${c.doer}` : (c.state === "pending" || c.state === "overdue") && assignedTo.length ? `Doer: ${assignedTo.join(", ")}` : null,
        c.note,
      ]
        .filter(Boolean)
        .join("\n") || undefined;

// Detailed / compact choice, remembered in this browser.
const DETAILED_KEY = "fms-detailed";
const detailedListeners = new Set<() => void>();
const readDetailed = () => {
  try {
    return localStorage.getItem(DETAILED_KEY) === "1";
  } catch {
    return false;
  }
};
const writeDetailed = (on: boolean) => {
  try {
    localStorage.setItem(DETAILED_KEY, on ? "1" : "0");
  } catch {}
  detailedListeners.forEach((fn) => fn());
};
const subscribeDetailed = (fn: () => void) => {
  detailedListeners.add(fn);
  return () => detailedListeners.delete(fn);
};

// Conditional formatting: a tint plus a coloured edge per state, so cells read at a glance even
// where tints are hard to tell apart (the edge is an inset shadow: the table's borders are separate).
const TONE: Record<FmsCell["state"], string> = {
  done: "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
  late: "bg-orange-50 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100",
  pending: "bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100",
  overdue: "bg-rose-100 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100",
  waiting: "",
  na: "bg-muted/40 text-muted-foreground",
};
/** The coloured edge on a step's first cell. */
const EDGE: Record<FmsCell["state"], string> = {
  done: "shadow-[inset_3px_0_0_var(--color-emerald-500)]",
  late: "shadow-[inset_3px_0_0_var(--color-orange-500)]",
  pending: "shadow-[inset_3px_0_0_var(--color-sky-500)]",
  overdue: "shadow-[inset_3px_0_0_var(--color-rose-600)]",
  waiting: "",
  na: "",
};

/** The cell's state in words, with an icon: on time · late by · time left · overdue by. */
function Status({ c, className }: { c: FmsCell; className?: string }) {
  if (c.state === "na" || c.state === "waiting" || c.delayHours === null) return null;
  const late = c.delayHours > 0;
  const [Icon, text, tone] =
    c.state === "overdue"
      ? [TriangleAlertIcon, `+${formatHours(c.delayHours)} overdue`, "rounded bg-rose-600 px-1 py-px font-semibold text-white"]
      : c.state === "pending"
        ? [HourglassIcon, `${formatHours(-c.delayHours)} left`, "font-medium text-sky-700 dark:text-sky-300"]
        : late
          ? [ClockAlertIcon, `+${formatHours(c.delayHours)} late`, "font-semibold text-orange-700 dark:text-orange-300"]
          : [CircleCheckIcon, "On time", "font-medium text-emerald-700 dark:text-emerald-300"];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular", tone, className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

type Filter = "mine" | "open" | "overdue" | "all";

export function FmsGrid({
  rows,
  tat,
  canDo,
  mine,
  assigned,
  canShortClose,
  initialStep,
  initialFilter,
}: {
  rows: FmsRow[];
  tat: TatSettings;
  /** May close a partly received PO's balance (receive doers and managers). */
  canShortClose: boolean;
  /** Opened from a link like the dashboard's "Overdue by step" (?step=ST5&show=overdue), or coming back to the sheet. */
  initialStep?: StepCode | null;
  initialFilter?: Filter | null;
  /** Role allows doing the step (shows the action button). */
  canDo: Record<StepCode, boolean>;
  /** Step is this user's responsibility (assigned doer, or nobody assigned and role allows). */
  mine: Record<StepCode, boolean>;
  assigned: Record<StepCode, string[]>;
}) {
  const mineCount = rows.filter((r) => r.current && mine[r.current]).length;
  const [filter, setFilter] = useState<Filter>(initialFilter ?? (mineCount ? "mine" : "open"));
  const [step, setStep] = useState<StepCode | "any">(initialStep ?? "any");
  const [query, setQuery] = useState("");
  // Compact: one column per step so all nine fit on screen. Detailed: Planned / Actual / Delay for each.
  // A single step can be opened by clicking its header (or its card above).
  const detailed = useSyncExternalStore(subscribeDetailed, readDetailed, () => false);
  const [opened, setOpened] = useState<StepCode | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const expanded = (code: StepCode) => detailed || opened === code || step === code;

  const toggleDetailed = () => {
    writeDetailed(!detailed);
    setOpened(null);
  };

  // The chosen step and filter go into the address (replacing it, no reload), so coming back to the
  // sheet — the back link from a record opened here, or the browser's — shows the same view.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (step === "any") url.searchParams.delete("step");
    else url.searchParams.set("step", step);
    url.searchParams.set("show", filter);
    const next = url.pathname + url.search + url.hash;
    if (next === window.location.pathname + window.location.search + window.location.hash) return;
    window.history.replaceState(window.history.state, "", next);
    recordVisit(url.pathname + url.search);
  }, [step, filter]);

  // Picking a step card brings that step's columns into view, next to the frozen Indent / Item columns.
  useEffect(() => {
    const box = scroller.current;
    if (step === "any" || !box) return;
    const header = box.querySelector<HTMLElement>(`th[data-step="${step}"]`);
    if (!header) return;
    const frozen = [...box.querySelectorAll<HTMLElement>("thead th.sticky")].reduce((w, th) => w + th.offsetWidth, 0);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: Math.max(0, header.offsetLeft - frozen), top: 0, behavior: smooth ? "smooth" : "auto" });
    box.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
  }, [step]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "mine" && !(r.current && mine[r.current])) return false;
      if (filter === "open" && !r.current) return false;
      if (step === "any") {
        if (filter === "overdue" && !r.overdue) return false;
      } else if (filter === "overdue") {
        // Overdue at that step, even if an earlier step is also pending (same count as the step's "late").
        if (r.cells[step].state !== "overdue" || r.cells[step].shared) return false;
      } else if (r.current !== step) {
        return false;
      }
      if (q && ![r.indentNumber, r.item, r.poNumber, r.vendor, r.department, r.requestedBy].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filter, step, query, mine]);

  const summary = FMS_STEPS.map((s) => ({
    ...s,
    pending: rows.filter((r) => r.current === s.code).length,
    overdue: rows.filter((r) => r.cells[s.code].state === "overdue" && !r.cells[s.code].shared).length,
    late: rows.filter((r) => r.cells[s.code].state === "late" && !r.cells[s.code].shared).length,
    done: rows.filter((r) => r.cells[s.code].state === "done" && !r.cells[s.code].shared).length,
  }));

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const head1 = ["Indent", "Raised", "Item", "Department", "Requested by", "Priority", "PO", "Vendor"];
    const head2 = head1.map(() => "");
    for (const s of FMS_STEPS) {
      head1.push(`${s.code} ${s.name}`, "", "", "", "");
      head2.push("Planned", "Actual", "Delay (h)", "Status", "Doer");
    }
    const asDate = (iso: string | null) => (iso ? new Date(iso) : "");
    const data = shown.map((r) => [
      r.indentNumber,
      asDate(r.raisedAt),
      r.item,
      r.department ?? "",
      r.requestedBy,
      r.urgent ? "Urgent" : "Normal",
      r.lot ? `${r.poNumber ?? ""} (${r.lot})` : (r.poNumber ?? ""),
      r.vendor ?? "",
      ...FMS_STEPS.flatMap((s) => {
        const c = r.cells[s.code];
        if (c.shared) return ["", "", "", "as lot 1", ""];
        return [asDate(c.planned), asDate(c.actual), c.delayHours ?? "", c.state === "na" ? "N/A" : c.state, c.doer ?? ""];
      }),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([head1, head2, ...data], { cellDates: true, dateNF: "dd-mmm-yy hh:mm" });
    sheet["!merges"] = FMS_STEPS.map((_, i) => ({ s: { r: 0, c: 8 + i * 5 }, e: { r: 0, c: 8 + i * 5 + 4 } }));
    sheet["!cols"] = [...head1.slice(0, 8).map(() => ({ wch: 14 })), ...FMS_STEPS.flatMap(() => [{ wch: 16 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 14 }])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "FMS");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Step", "Name", "How", "Doers", "TAT normal (h)", "TAT urgent (h)"],
        ...FMS_STEPS.map((s) => [s.code, s.name, s.how, assigned[s.code].join(", ") || "Anyone allowed", tat[s.code].normal, tat[s.code].urgent]),
      ]),
      "Steps & TAT",
    );
    XLSX.writeFile(wb, `Purchase FMS ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {summary.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => setStep(step === s.code ? "any" : s.code)}
            className={cn(
              "rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/40",
              step === s.code && "border-primary ring-1 ring-primary/30",
              s.overdue > 0 && "border-rose-300 dark:border-rose-900",
            )}
          >
            <div className="text-[11px] font-semibold text-muted-foreground">{s.code}</div>
            <div className="truncate text-xs leading-tight" title={s.name}>
              {s.short}
            </div>
            <div className="mt-1 flex items-baseline gap-2 text-xs tabular">
              <span title="Waiting at this step">
                <span className="text-base font-semibold">{s.pending}</span> open
              </span>
              {s.overdue > 0 && <span className="font-medium text-rose-600">{s.overdue} late</span>}
            </div>
          </button>
        ))}
      </div>

      {/* isolate: the table's frozen header/columns stay below the sidebar and the top bar. */}
      <div className="isolate min-w-0 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          {(["mine", "open", "overdue", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f === "mine" ? `My tasks (${mineCount})` : f === "open" ? "In progress" : f === "overdue" ? "Overdue now" : "All"}
            </button>
          ))}
          {step !== "any" && (
            <button type="button" onClick={() => setStep("any")} className="rounded-md bg-muted px-2 py-1 text-xs">
              At {step} ✕
            </button>
          )}
          <InputGroup className="ml-auto w-60">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Indent, item, PO, vendor" aria-label="Search" />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={toggleDetailed} aria-pressed={detailed} title={detailed ? "One column per step" : "Planned, actual and delay for every step"}>
            {detailed ? <ChevronsRightLeftIcon /> : <ChevronsLeftRightIcon />}
            {detailed ? "Compact" : "Detailed"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <DownloadIcon />
            Export to Excel
          </Button>
        </div>

        <div ref={scroller} className="max-h-[72vh] overflow-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted">
                <th rowSpan={2} className="sticky left-0 z-30 min-w-28 border-r border-b bg-muted px-2 py-2 text-left font-semibold">
                  Indent
                </th>
                <th rowSpan={2} className="sticky left-28 z-30 min-w-44 border-r border-b bg-muted px-2 py-2 text-left font-semibold">
                  Item / PO
                </th>
                {FMS_STEPS.map((s) => {
                  const open = expanded(s.code);
                  return (
                    <th
                      key={s.code}
                      colSpan={open ? 3 : 1}
                      rowSpan={open ? 1 : 2}
                      data-step={s.code}
                      className={cn(
                        "border-r border-b p-0 text-left align-top font-semibold transition-colors",
                        open ? "min-w-64" : "w-28 min-w-28",
                        // Solid backgrounds: rows scroll underneath this sticky header.
                        step === s.code ? "bg-accent" : "bg-muted",
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => !detailed && setOpened(opened === s.code ? null : s.code)}
                            aria-expanded={open}
                            className={cn(
                              "group/h block w-full px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              detailed ? "cursor-default" : "hover:bg-primary/5",
                            )}
                          >
                            <span className="flex items-center gap-1">
                              <span className="text-primary">{s.code}</span>
                              <span className={cn(!open && "truncate")}>{open ? s.name : s.short}</span>
                              {!detailed && (
                                <ChevronsLeftRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 group-hover/h:opacity-100 group-focus-visible/h:opacity-100" />
                              )}
                            </span>
                            <span className="block font-normal text-muted-foreground">
                              {open ? `TAT ${formatHours(tat[s.code].normal)} · urgent ${formatHours(tat[s.code].urgent)}` : `TAT ${formatHours(tat[s.code].normal)}`}
                            </span>
                            <span className={cn("block truncate font-normal", open ? "max-w-56" : "max-w-24", mine[s.code] ? "text-primary" : "text-muted-foreground")}>
                              {open && "Doer: "}
                              {assigned[s.code].length ? assigned[s.code].join(", ") : "anyone allowed"}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72 text-xs">
                          <div className="font-medium">
                            {s.code} {s.name}
                          </div>
                          <div>How: {s.how}</div>
                          <div>Who: {s.who}</div>
                          {s.note && <div className="mt-1 opacity-80">{s.note}</div>}
                          {!detailed && <div className="mt-1 opacity-80">{open ? "Click to fold" : "Click for planned, actual and delay"}</div>}
                        </TooltipContent>
                      </Tooltip>
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-muted text-muted-foreground">
                {FMS_STEPS.filter((s) => expanded(s.code)).map((s) => (
                  <Fragment key={s.code}>
                    <th className="min-w-24 border-b bg-muted px-2 py-1 text-left font-medium">Planned</th>
                    <th className="min-w-24 border-b bg-muted px-2 py-1 text-left font-medium">Actual</th>
                    <th className="min-w-16 border-r border-b bg-muted px-2 py-1 text-right font-medium">Delay</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="group">
                  <td className="sticky left-0 z-10 border-r border-b bg-card px-2 py-1.5 align-top group-hover:bg-muted">
                    <Link href={`/indents/${r.indentId}`} className="font-medium text-primary hover:underline">
                      {r.indentNumber}
                    </Link>
                    <div className="text-muted-foreground">{fmt(r.raisedAt)}</div>
                    {r.urgent && <div className="font-medium text-rose-600">Urgent</div>}
                  </td>
                  <td className="sticky left-28 z-10 max-w-44 border-r border-b bg-card px-2 py-1.5 align-top group-hover:bg-muted">
                    <div className="truncate font-medium" title={r.item}>
                      {r.item}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {r.department ?? r.requestedBy}
                      {r.poId && (
                        <>
                          {" · "}
                          <Link href={`/purchase-orders/${r.poId}`} className="text-primary hover:underline">
                            {r.poNumber ?? "Draft PO"}
                          </Link>
                        </>
                      )}
                    </div>
                    {r.vendor && <div className="truncate text-muted-foreground">{r.vendor}</div>}
                    {r.lot && <div className="font-medium text-amber-700 dark:text-amber-400">{r.lot}</div>}
                    {r.shortClose && canShortClose && (
                      <Link
                        href={r.shortClose}
                        className="block w-fit text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        title="The rest of this PO isn't coming: close it with the short quantity"
                      >
                        Short close balance
                      </Link>
                    )}
                  </td>
                  {FMS_STEPS.map((s) => {
                    const c = r.cells[s.code];
                    // A later delivery lot: this step is the same as on the PO's first lot.
                    if (c.shared)
                      return (
                        <td
                          key={s.code}
                          colSpan={expanded(s.code) ? 3 : 1}
                          className="border-r border-b px-2 py-1.5 text-center align-top text-muted-foreground"
                          title="Same as this PO's first lot"
                        >
                          〃
                        </td>
                      );
                    const tone = TONE[c.state];
                    const tip = [c.doer && `By ${c.doer}`, c.note].filter(Boolean).join(" · ");
                    const action =
                      c.action && canDo[s.code] ? (
                        <>
                          <Link
                            href={c.action.href}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium shadow-xs ring-1 transition-colors",
                              c.state === "overdue"
                                ? "bg-rose-600 text-white ring-rose-700 hover:bg-rose-700"
                                : "bg-background text-primary ring-primary/30 hover:bg-primary hover:text-primary-foreground",
                            )}
                          >
                            {c.action.label}
                            <ArrowRightIcon className="size-3 shrink-0" />
                          </Link>
                          {c.alt && (
                            <Link href={c.alt.href} className="mt-1 block w-fit text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                              {c.alt.label}
                            </Link>
                          )}
                        </>
                      ) : null;
                    if (!expanded(s.code)) {
                      // Compact: the action (or the date that matters) and the status; details on hover.
                      return (
                        <td key={s.code} className={cn("w-28 border-r border-b px-2 py-1.5 align-top", tone, EDGE[c.state])} title={cellTitle(c, assigned[s.code])}>
                          {c.state === "na" ? (
                            "N/A"
                          ) : action ? (
                            <div className="[&_a]:px-1.5 [&_a]:text-[11px] [&_a]:leading-tight">{action}</div>
                          ) : c.actual && c.link ? (
                            <Link href={c.link} className="font-medium hover:underline">
                              {fmtDay(c.actual)}
                            </Link>
                          ) : c.actual ? (
                            <span className="font-medium">{fmtDay(c.actual)}</span>
                          ) : c.planned && (c.state === "pending" || c.state === "overdue") ? (
                            <span>Due {fmtDay(c.planned)}</span>
                          ) : null}
                          <Status c={c} className="mt-1 flex w-fit" />
                        </td>
                      );
                    }
                    return (
                      <Fragment key={s.code}>
                        <td className={cn("border-b px-2 py-1.5 align-top whitespace-nowrap", tone, EDGE[c.state])}>{c.state === "na" ? "N/A" : fmt(c.planned)}</td>
                        <td className={cn("border-b px-2 py-1.5 align-top whitespace-nowrap", tone)} title={tip || undefined}>
                          {action ? (
                            action
                          ) : c.actual && c.link ? (
                            <Link href={c.link} className="hover:underline">
                              {fmt(c.actual)}
                            </Link>
                          ) : c.actual ? (
                            fmt(c.actual)
                          ) : c.state === "overdue" ? (
                            "Pending"
                          ) : c.state === "pending" ? (
                            "Due"
                          ) : (
                            ""
                          )}
                          {c.doer ? (
                            <div className="max-w-24 truncate opacity-70">{c.doer}</div>
                          ) : (c.state === "pending" || c.state === "overdue") && assigned[s.code].length ? (
                            <div className="mt-0.5 max-w-28 truncate opacity-70">{assigned[s.code].join(", ")}</div>
                          ) : null}
                        </td>
                        <td className={cn("border-r border-b px-2 py-1.5 text-right align-top whitespace-nowrap", tone)}>
                          <Status c={c} />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={2 + FMS_STEPS.reduce((n, s) => n + (expanded(s.code) ? 3 : 1), 0)} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs">
          {(
            [
              ["done", "Done on time", { state: "done", delayHours: -1 }],
              ["late", "Done late", { state: "late", delayHours: 50 }],
              ["pending", "Due (within TAT)", { state: "pending", delayHours: -5 }],
              ["overdue", "Overdue now", { state: "overdue", delayHours: 98 }],
              ["na", "Not applicable", null],
            ] as const
          ).map(([k, label, sample]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-flex h-6 items-center rounded-sm border px-2", TONE[k], EDGE[k])}>
                {sample ? <Status c={sample as FmsCell} /> : "N/A"}
              </span>
              {label}
            </span>
          ))}
          <span className="text-muted-foreground">· Click a step button to do the task (you come back here after saving) · Click a done date to open the record · Hover a cell for planned / actual / doer · Click a step heading to open its columns</span>
        </div>
      </div>
    </div>
  );
}
