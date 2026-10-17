/**
 * The app-wide date range ("Today", "This month", a custom From–To…) chosen in the top bar. It is kept
 * in a cookie as the preset, not the dates, so "Today" still means today tomorrow. Every dated list,
 * report and record page filters to it. Default: this FY; "All dates" turns the filter off.
 *
 * Client-safe: the picker uses the same presets and labels as the server.
 */

import { dateFormatter } from "@/lib/format";

export const DATE_RANGE_COOKIE = "pd_range";
/** With no choice made, pages show the current financial year: quick, and what people look at most. */
export const DEFAULT_RANGE = "this-fy";
/** Cookie value for "All dates" (no filter). */
export const ALL_DATES = "all";

export const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-week", label: "This week" },
  { key: "last-7-days", label: "Last 7 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "this-fy", label: "This FY" },
  { key: "last-fy", label: "Last FY" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"];

export type DateRange = {
  /** The cookie value, e.g. "this-month" or "custom:2026-08-01:2026-08-31". */
  value: string;
  preset: RangePreset | "custom";
  /** yyyy-mm-dd, both inclusive (IST calendar days). */
  from: string;
  to: string;
  /** "This month", or the dates of a custom range. */
  label: string;
  /** "1 Oct – 31 Oct 2026" */
  span: string;
  /** For queries: [start, end) as instants, IST day boundaries. Also right for date-only columns. */
  start: Date;
  end: Date;
};

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(utc(d) + n * DAY);
const isDate = (d: string) => ISO.test(d) && iso(utc(d)) === d;

/** Today's date in India, yyyy-mm-dd. */
export function todayIST(now = new Date()) {
  return dateFormatter("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** From–to dates (inclusive) of a preset, relative to `today`. Weeks start on Monday; the FY on 1 April. */
export function presetDates(preset: RangePreset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const monthStart = (yy: number, mm: number) => iso(Date.UTC(yy, mm - 1, 1));
  const monthEnd = (yy: number, mm: number) => iso(Date.UTC(yy, mm, 0));
  const fy = m >= 4 ? y : y - 1;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "this-week": {
      const sinceMonday = (new Date(utc(today)).getUTCDay() + 6) % 7;
      const monday = addDays(today, -sinceMonday);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "last-7-days":
      return { from: addDays(today, -6), to: today };
    case "this-month":
      return { from: monthStart(y, m), to: monthEnd(y, m) };
    case "last-month":
      return m === 1 ? { from: monthStart(y - 1, 12), to: monthEnd(y - 1, 12) } : { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
    case "this-quarter": {
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: monthStart(y, q), to: monthEnd(y, q + 2) };
    }
    case "this-fy":
      return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
    case "last-fy":
      return { from: `${fy - 1}-04-01`, to: `${fy}-03-31` };
  }
}

/** "1 Oct – 31 Oct 2026", "10 Oct 2026", "15 Dec 2025 – 10 Jan 2026" */
export function formatSpan(from: string, to: string) {
  const part = (d: string, withYear: boolean) => {
    const [yy, mm, dd] = d.split("-").map(Number);
    return `${dd} ${MONTHS[mm - 1]}${withYear ? ` ${yy}` : ""}`;
  };
  if (from === to) return part(from, true);
  return `${part(from, from.slice(0, 4) !== to.slice(0, 4))} – ${part(to, true)}`;
}

export function customValue(from: string, to: string) {
  return from <= to ? `custom:${from}:${to}` : `custom:${to}:${from}`;
}

/** Reads a cookie value; null for "All dates" or anything malformed. */
export function resolveRange(value: string | null | undefined, now = new Date()): DateRange | null {
  if (!value) return null;
  let preset: DateRange["preset"];
  let from: string;
  let to: string;
  if (value.startsWith("custom:")) {
    const [, a, b] = value.split(":");
    if (!a || !b || !isDate(a) || !isDate(b) || a > b) return null;
    preset = "custom";
    from = a;
    to = b;
  } else {
    const p = RANGE_PRESETS.find((x) => x.key === value);
    if (!p) return null;
    preset = p.key;
    ({ from, to } = presetDates(p.key, todayIST(now)));
  }
  const span = formatSpan(from, to);
  return {
    value,
    preset,
    from,
    to,
    label: preset === "custom" ? span : RANGE_PRESETS.find((x) => x.key === preset)!.label,
    span,
    start: new Date(`${from}T00:00:00+05:30`),
    end: new Date(`${addDays(to, 1)}T00:00:00+05:30`),
  };
}

/** Prisma filter for a date / timestamp column; undefined (no filter) when no range is chosen. */
export function within(range: DateRange | null) {
  return range ? { gte: range.start, lt: range.end } : undefined;
}
