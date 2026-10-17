/**
 * FMS scorecards: who finished their steps on time vs late in a period, and what is overdue with
 * them right now. Done steps are credited to the person who actually did them; pending steps are
 * charged to the step's assigned doers ("Unassigned" when none are set).
 */
import type { FmsRow } from "@/lib/fms";
import { FMS_STEPS, type StepCode } from "@/lib/fms-steps";

export type PeriodKey = "this-week" | "last-week" | "this-month" | "last-month";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
];

const IST = 330 * 60_000;
const DAY = 86_400_000;

/** Period boundaries in IST (weeks start Monday). */
export function periodRange(key: PeriodKey, now = new Date()) {
  const ist = new Date(now.getTime() + IST);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const today = Date.UTC(y, m, ist.getUTCDate()) - IST;
  const monday = today - ((ist.getUTCDay() + 6) % 7) * DAY;
  switch (key) {
    case "this-week":
      return { from: new Date(monday), to: new Date(monday + 7 * DAY) };
    case "last-week":
      return { from: new Date(monday - 7 * DAY), to: new Date(monday) };
    case "this-month":
      return { from: new Date(Date.UTC(y, m, 1) - IST), to: new Date(Date.UTC(y, m + 1, 1) - IST) };
    case "last-month":
      return { from: new Date(Date.UTC(y, m - 1, 1) - IST), to: new Date(Date.UTC(y, m, 1) - IST) };
  }
}

type Tally = { done: number; onTime: number; late: number; delay: number; pending: number; overdue: number; overdueHours: number };
const blank = (): Tally => ({ done: 0, onTime: 0, late: 0, delay: 0, pending: 0, overdue: 0, overdueHours: 0 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

function tally(rows: FmsRow[], assigned: Record<StepCode, string[]>, range: { from: Date; to: Date }) {
  const byPerson = new Map<string, Tally>();
  const byStep = new Map<StepCode, Tally>(FMS_STEPS.map((s) => [s.code, blank()]));
  const get = (name: string) => byPerson.get(name) ?? byPerson.set(name, blank()).get(name)!;
  for (const r of rows) {
    for (const s of FMS_STEPS) {
      const c = r.cells[s.code];
      // A later delivery lot repeats its PO's earlier steps: counted once, on the first row.
      if (c.shared) continue;
      const step = byStep.get(s.code)!;
      if ((c.state === "done" || c.state === "late") && c.actual) {
        const at = new Date(c.actual).getTime();
        if (at < range.from.getTime() || at >= range.to.getTime()) continue;
        for (const t of [get(c.doer ?? "Not recorded"), step]) {
          t.done++;
          if (c.state === "late") {
            t.late++;
            t.delay += c.delayHours ?? 0;
          } else t.onTime++;
        }
      } else if (c.state === "pending" || c.state === "overdue") {
        const people = assigned[s.code].length ? assigned[s.code] : [`Unassigned (${s.code})`];
        for (const t of [...people.map(get), step]) {
          t.pending++;
          if (c.state === "overdue") {
            t.overdue++;
            t.overdueHours += c.delayHours ?? 0;
          }
        }
      }
    }
  }
  return { byPerson, byStep };
}

export function doerScorecard(rows: FmsRow[], assigned: Record<StepCode, string[]>, range: { from: Date; to: Date }) {
  const { byPerson } = tally(rows, assigned, range);
  return [...byPerson.entries()]
    .map(([person, t]) => ({
      person,
      done: t.done,
      onTime: t.onTime,
      late: t.late,
      onTimePct: pct(t.onTime, t.done),
      avgDelayH: t.late ? r1(t.delay / t.late) : null,
      pendingNow: t.pending,
      overdueNow: t.overdue,
    }))
    .sort((a, b) => b.overdueNow - a.overdueNow || (a.onTimePct ?? 101) - (b.onTimePct ?? 101) || b.done - a.done);
}

export function stepScorecard(rows: FmsRow[], assigned: Record<StepCode, string[]>, range: { from: Date; to: Date }) {
  const { byStep } = tally(rows, assigned, range);
  return FMS_STEPS.map((s) => {
    const t = byStep.get(s.code)!;
    return {
      step: `${s.code} ${s.name}`,
      code: s.code,
      doers: assigned[s.code].join(", ") || "Anyone allowed",
      done: t.done,
      onTimePct: pct(t.onTime, t.done),
      avgDelayH: t.late ? r1(t.delay / t.late) : null,
      pendingNow: t.pending,
      overdueNow: t.overdue,
      avgOverdueH: t.overdue ? r1(t.overdueHours / t.overdue) : null,
    };
  });
}

/** Team total for a period: steps done and the share done within TAT. */
export function overallOnTime(rows: FmsRow[], range: { from: Date; to: Date }) {
  const none = Object.fromEntries(FMS_STEPS.map((s) => [s.code, [] as string[]])) as Record<StepCode, string[]>;
  const { byStep } = tally(rows, none, range);
  let done = 0;
  let onTime = 0;
  for (const t of byStep.values()) {
    done += t.done;
    onTime += t.onTime;
  }
  return { done, onTime, pct: pct(onTime, done) };
}