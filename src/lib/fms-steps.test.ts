import { describe, expect, it } from "vitest";
import { addTat, canDoStep, endOfDayIST, formatHours, resolveTat } from "./fms-steps";

describe("addTat", () => {
  // Fri 2 Oct 2026, 10:00 IST
  const fri = new Date("2026-10-02T04:30:00Z");

  it("adds calendar hours when Sundays count", () => {
    expect(addTat(fri, 48, true).toISOString()).toBe("2026-10-04T04:30:00.000Z");
  });

  it("skips Sunday", () => {
    // +48h lands on Sunday 10:00 → pushed to Monday 10:00 IST
    expect(addTat(fri, 48, false).toISOString()).toBe("2026-10-05T04:30:00.000Z");
  });

  it("skips Sunday in the middle of a longer TAT", () => {
    // +72h: Sat, (Sun skipped) Mon, Tue → Tue 10:00 IST
    expect(addTat(fri, 72, false).toISOString()).toBe("2026-10-06T04:30:00.000Z");
  });
});

describe("endOfDayIST", () => {
  it("is 23:59 IST of the stored date", () => {
    expect(endOfDayIST(new Date("2026-10-09T00:00:00Z")).toISOString()).toBe("2026-10-09T18:29:00.000Z");
  });
});

describe("resolveTat", () => {
  it("fills defaults and ignores bad values", () => {
    const t = resolveTat({ ST1: { normal: 48, urgent: "x", doers: [3, "x", 5] } });
    expect(t.ST1).toEqual({ normal: 48, urgent: 24, doers: [3, 5] });
    expect(t.ST9).toEqual({ normal: 48, urgent: 24, doers: [] });
  });
});

describe("canDoStep", () => {
  it("follows role permissions", () => {
    expect(canDoStep(["WAREHOUSE"], "ST2")).toBe(false);
    expect(canDoStep(["MANAGER"], "ST2")).toBe(true);
    expect(canDoStep(["WAREHOUSE"], "ST8")).toBe(true);
    expect(canDoStep(["ACCOUNTS"], "ST9")).toBe(true);
    expect(canDoStep(["ACCOUNTS"], "ST5")).toBe(false);
  });

  it("allows a step when any of the user's roles does", () => {
    expect(canDoStep(["ACCOUNTS", "WAREHOUSE"], "ST5")).toBe(true);
    expect(canDoStep(["PURCHASER", "WAREHOUSE"], "ST6")).toBe(true);
    expect(canDoStep([], "ST1")).toBe(false);
  });
});

describe("formatHours", () => {
  it("formats", () => {
    expect(formatHours(5)).toBe("5h");
    expect(formatHours(72)).toBe("3d");
    expect(formatHours(30)).toBe("1d 6h");
  });
});
