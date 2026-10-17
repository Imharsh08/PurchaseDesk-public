import { describe, expect, it } from "vitest";
import { ALL_DATES, DEFAULT_RANGE, customValue, formatSpan, presetDates, resolveRange, todayIST } from "./date-range";

describe("presetDates", () => {
  // Saturday 10 Oct 2026
  const today = "2026-10-10";
  it("resolves each preset", () => {
    expect(presetDates("today", today)).toEqual({ from: today, to: today });
    expect(presetDates("yesterday", today)).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(presetDates("this-week", today)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetDates("last-7-days", today)).toEqual({ from: "2026-10-04", to: today });
    expect(presetDates("this-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetDates("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetDates("this-quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetDates("this-fy", today)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(presetDates("last-fy", today)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });

  it("handles year and FY boundaries", () => {
    expect(presetDates("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetDates("this-fy", "2026-03-31")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(presetDates("this-week", "2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetDates("this-week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetDates("last-month", "2024-03-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("resolveRange", () => {
  it("uses IST day boundaries", () => {
    // 11 Oct 2026, 01:00 IST = 10 Oct 19:30 UTC
    const now = new Date("2026-10-10T19:30:00Z");
    expect(todayIST(now)).toBe("2026-10-11");
    const r = resolveRange("today", now)!;
    expect(r.from).toBe("2026-10-11");
    expect(r.start.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(r.label).toBe("Today");
  });

  it("reads custom ranges and rejects bad values", () => {
    const r = resolveRange("custom:2026-08-01:2026-08-31")!;
    expect(r).toMatchObject({ preset: "custom", from: "2026-08-01", to: "2026-08-31", label: "1 Aug – 31 Aug 2026" });
    expect(resolveRange("custom:2026-08-31:2026-08-01")).toBeNull();
    expect(resolveRange("custom:2026-02-30:2026-03-01")).toBeNull();
    expect(resolveRange("forever")).toBeNull();
    expect(resolveRange(ALL_DATES)).toBeNull();
    expect(resolveRange(DEFAULT_RANGE)?.label).toBe("This FY");
    expect(resolveRange(undefined)).toBeNull();
  });

  it("orders custom dates", () => {
    expect(customValue("2026-09-10", "2026-09-01")).toBe("custom:2026-09-01:2026-09-10");
  });
});

describe("formatSpan", () => {
  it("formats", () => {
    expect(formatSpan("2026-10-10", "2026-10-10")).toBe("10 Oct 2026");
    expect(formatSpan("2025-12-15", "2026-01-10")).toBe("15 Dec 2025 – 10 Jan 2026");
  });
});
