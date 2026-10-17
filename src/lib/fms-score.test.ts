import { describe, expect, it } from "vitest";
import type { FmsCell, FmsRow } from "./fms";
import { FMS_STEPS, type StepCode } from "./fms-steps";
import { doerScorecard, periodRange, stepScorecard } from "./fms-score";

const cell = (patch: Partial<FmsCell>): FmsCell => ({ planned: null, actual: null, delayHours: null, state: "waiting", doer: null, note: null, link: null, action: null, ...patch });
const row = (cells: Partial<Record<StepCode, Partial<FmsCell>>>): FmsRow => ({
  key: "k",
  indentId: 1,
  indentNumber: "IND-1",
  raisedAt: "2026-10-01T00:00:00Z",
  item: "x",
  lot: null,
  receivable: false,
  department: null,
  requestedBy: "R",
  urgent: false,
  poId: null,
  poNumber: null,
  vendor: null,
  current: null,
  overdue: false,
  cells: Object.fromEntries(FMS_STEPS.map((s) => [s.code, cell(cells[s.code] ?? {})])) as Record<StepCode, FmsCell>,
});
const none = Object.fromEntries(FMS_STEPS.map((s) => [s.code, [] as string[]])) as Record<StepCode, string[]>;
const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T00:00:00Z") };

describe("doerScorecard", () => {
  it("credits done steps to the doer and charges overdue to assigned doers", () => {
    const rows = [
      row({ ST1: { state: "done", actual: "2026-10-02T10:00:00Z", doer: "Asha", delayHours: -3 }, ST2: { state: "late", actual: "2026-10-03T10:00:00Z", doer: "Vikram", delayHours: 10 } }),
      row({ ST1: { state: "late", actual: "2026-10-04T10:00:00Z", doer: "Asha", delayHours: 6 }, ST5: { state: "overdue", delayHours: 20 } }),
      row({ ST1: { state: "done", actual: "2026-09-20T10:00:00Z", doer: "Asha" } }), // outside the period
    ];
    const card = doerScorecard(rows, { ...none, ST5: ["Ravi"] }, range);
    const asha = card.find((c) => c.person === "Asha")!;
    expect(asha).toMatchObject({ done: 2, onTime: 1, late: 1, onTimePct: 50, avgDelayH: 6 });
    expect(card.find((c) => c.person === "Vikram")).toMatchObject({ done: 1, onTimePct: 0, avgDelayH: 10 });
    expect(card.find((c) => c.person === "Ravi")).toMatchObject({ overdueNow: 1, pendingNow: 1, done: 0, onTimePct: null });
    expect(card[0].person).toBe("Ravi"); // most overdue first
  });

  it("unassigned pending steps are reported as such", () => {
    const card = doerScorecard([row({ ST8: { state: "pending" } })], none, range);
    expect(card[0]).toMatchObject({ person: "Unassigned (ST8)", pendingNow: 1, overdueNow: 0 });
  });
});

describe("stepScorecard", () => {
  it("summarises per step", () => {
    const s = stepScorecard([row({ ST1: { state: "late", actual: "2026-10-02T00:00:00Z", doer: "A", delayHours: 4 } })], none, range);
    expect(s[0]).toMatchObject({ code: "ST1", done: 1, onTimePct: 0, avgDelayH: 4 });
  });
});

describe("periodRange", () => {
  // Saturday 3 Oct 2026, 14:00 IST
  const now = new Date("2026-10-03T08:30:00Z");
  it("this week starts Monday 00:00 IST", () => {
    expect(periodRange("this-week", now).from.toISOString()).toBe("2026-09-27T18:30:00.000Z");
  });
  it("last month", () => {
    const r = periodRange("last-month", now);
    expect(r.from.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });
});
