/**
 * FMS (flow monitoring) steps for purchase, each with a turnaround time (TAT). A step's planned
 * time = the previous step's actual time + its TAT (Sundays skipped unless configured), except
 * dispatch and receipt, which follow the dates the vendor / PO committed to.
 */

import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/roles";

export type StepCode = "ST1" | "ST2" | "ST3" | "ST4" | "ST5" | "ST6" | "ST7" | "ST8" | "ST9";
export type Tat = { normal: number; urgent: number };
/** TAT plus the people responsible for the step (empty = anyone whose role allows it). */
export type StepConfig = Tat & { doers: number[] };
export type TatSettings = Record<StepCode, StepConfig>;

/** What a user's role must allow to do each step. */
export const STEP_PERMISSION: Record<StepCode, Permission[]> = {
  ST1: ["manageQuotations"],
  ST2: ["approveComparison"],
  ST3: ["createPO", "sendPO", "approvePO"],
  ST4: ["sendPO"],
  ST5: ["receiveGoods"],
  ST6: ["qualityCheck"],
  ST7: ["receiveGoods"],
  ST8: ["receiveGoods"],
  ST9: ["enterBill"],
};

export function canDoStep(roles: readonly Role[], code: StepCode) {
  return STEP_PERMISSION[code].some((p) => can(roles, p));
}

export const FMS_STEPS: { code: StepCode; name: string; short: string; how: string; who: string; defaults: Tat; note?: string }[] = [
  { code: "ST1", name: "Get three quotations", short: "Quotations", how: "Via email/WhatsApp; select vendors from Purchase Master", who: "Purchase", defaults: { normal: 72, urgent: 24 } },
  { code: "ST2", name: "Get approval for PO creation", short: "Approval", how: "WhatsApp/email confirmation; all POs must be in writing", who: "Manager", defaults: { normal: 24, urgent: 6 } },
  { code: "ST3", name: "Send PO to vendor & get lead time", short: "Send PO", how: "Create PDF, email/WhatsApp; confirm lead time", who: "Purchase", defaults: { normal: 24, urgent: 6 } },
  {
    code: "ST4",
    name: "Follow up with vendor (dispatch)", short: "Follow-up",
    how: "Phone/email; follow up 2 days before expected dispatch date and take bilty",
    who: "Purchase",
    defaults: { normal: 168, urgent: 48 },
    note: "Planned = dispatch date confirmed by the vendor; TAT used only when none was given",
  },
  {
    code: "ST5",
    name: "Receive material", short: "Receive",
    how: "Goods-in entry with invoice & bilty",
    who: "Store",
    defaults: { normal: 72, urgent: 24 },
    note: "Planned = PO delivery date; else dispatch + TAT (transit)",
  },
  { code: "ST6", name: "Quality & quantity check", short: "QC check", how: "QC checklist", who: "QC / Store", defaults: { normal: 24, urgent: 4 } },
  { code: "ST7", name: "Return material (if failed)", short: "Return", how: "Return checklist", who: "Store", defaults: { normal: 48, urgent: 24 }, note: "Only when material was rejected" },
  { code: "ST8", name: "Store material", short: "Store / Tally", how: "Update Tally", who: "Store", defaults: { normal: 24, urgent: 8 } },
  { code: "ST9", name: "Accounts process", short: "Accounts", how: "Scan & attach bills, send to accounts, enter in FIFO sheet", who: "Accounts", defaults: { normal: 48, urgent: 24 } },
];

export const DEFAULT_TAT = Object.fromEntries(FMS_STEPS.map((s) => [s.code, { ...s.defaults, doers: [] as number[] }])) as TatSettings;

/** Merges saved settings over the defaults (tolerates missing / malformed keys). */
export function resolveTat(saved: unknown): TatSettings {
  const out = { ...DEFAULT_TAT };
  if (saved && typeof saved === "object") {
    for (const s of FMS_STEPS) {
      const v = (saved as Record<string, Partial<StepConfig>>)[s.code];
      if (!v) continue;
      out[s.code] = {
        normal: Number.isFinite(Number(v.normal)) && Number(v.normal) >= 0 ? Number(v.normal) : s.defaults.normal,
        urgent: Number.isFinite(Number(v.urgent)) && Number(v.urgent) >= 0 ? Number(v.urgent) : s.defaults.urgent,
        doers: Array.isArray(v.doers) ? v.doers.filter((id): id is number => Number.isInteger(id)) : [],
      };
    }
  }
  return out;
}

const HOUR = 3_600_000;
const IST_OFFSET = 330 * 60_000;
const isSundayIST = (t: number) => new Date(t + IST_OFFSET).getUTCDay() === 0;

/** start + hours, skipping Sundays (IST) unless they count. */
export function addTat(start: Date, hours: number, countSundays: boolean) {
  let t = start.getTime();
  if (countSundays) return new Date(t + hours * HOUR);
  let remaining = hours;
  while (remaining > 0) {
    const step = Math.min(remaining, 24);
    t += step * HOUR;
    remaining -= step;
    while (isSundayIST(t)) t += 24 * HOUR;
  }
  return new Date(t);
}

/** End of a calendar date (date-only values are stored as UTC midnight) in IST: 23:59. */
export function endOfDayIST(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59) - IST_OFFSET);
}

/** Task screens opened from the FMS sheet (?from=fms) go back to it after saving. */
export function fmsReturnTo(from: unknown) {
  return from === "fms" ? "/fms" : null;
}

export function formatHours(h: number) {
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return r ? `${d}d ${r}h` : `${d}d`;
}
