import { describe, expect, it } from "vitest";
import { amountInWords, cleanNumber, financialYear, formatAmount, formatINR, parseNumber, toDateInput, toNumber } from "./format";

describe("pasted numbers", () => {
  it.each([
    ["66,750.00", "66750.00"],
    ["6,67,500", "667500"],
    ["₹ 6,675", "6675"],
    ["Rs. 320/-", "320"],
    [" 320 ", "320"],
    [".5", ".5"],
  ])("%s", (text, clean) => {
    expect(cleanNumber(text)).toBe(clean);
  });

  it("leaves text that isn't a number as typed, so it is reported", () => {
    expect(cleanNumber("12 Kg")).toBe("12 Kg");
    expect(cleanNumber("1.2.3")).toBe("1.2.3");
    expect(parseNumber("abc")).toBeNaN();
  });

  it("reads them as numbers", () => {
    expect(toNumber("66,750.00")).toBe(66750);
    expect(toNumber("not a number")).toBe(0);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("1,234.5")).toBe(1234.5);
  });
});

describe("amountInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [15, "Rupees Fifteen Only"],
    [100, "Rupees One Hundred Only"],
    [1_001, "Rupees One Thousand One Only"],
    [396_259, "Rupees Three Lakh Ninety Six Thousand Two Hundred Fifty Nine Only"],
    [12_50_00_000, "Rupees Twelve Crore Fifty Lakh Only"],
    [125_450.5, "Rupees One Lakh Twenty Five Thousand Four Hundred Fifty and Fifty Paise Only"],
  ])("%d", (value, words) => {
    expect(amountInWords(value)).toBe(words);
  });
});

describe("Indian number formatting", () => {
  it("groups by lakh and crore", () => {
    expect(formatAmount(12345678.9)).toBe("1,23,45,678.90");
    expect(formatINR(125000)).toBe("₹1,25,000.00");
    expect(formatINR(-50)).toBe("-₹50.00");
  });
  it("accepts Decimal-like values", () => {
    expect(formatAmount({ toString: () => "1500.5" })).toBe("1,500.50");
  });
});

describe("financialYear (IST)", () => {
  it("starts in April", () => {
    expect(financialYear(new Date("2026-03-31T10:00:00+05:30"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T00:30:00+05:30"))).toBe("2026-27");
  });
  it("uses IST, not UTC, at the boundary", () => {
    // 31 Mar 2026 19:00 UTC is already 1 Apr 00:30 in India
    expect(financialYear(new Date("2026-03-31T19:00:00Z"))).toBe("2026-27");
  });
  it("wraps the century suffix", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00+05:30"))).toBe("2099-00");
  });
});

describe("toDateInput", () => {
  it("formats in IST", () => {
    expect(toDateInput(new Date("2026-09-29T20:00:00Z"))).toBe("2026-09-30");
  });
});
