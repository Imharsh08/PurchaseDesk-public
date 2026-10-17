import { describe, expect, it } from "vitest";
import { formatPONumber, initialsOf, patternProblem, poCounterKey } from "./po-number";

const oct2026 = new Date("2026-10-14T10:00:00+05:30");
const feb2027 = new Date("2027-02-01T10:00:00+05:30");

describe("PO number format", () => {
  it("builds ABC/GS0047/26-27 from prefix, sender's initials, serial and financial year", () => {
    expect(formatPONumber("{PREFIX}/{INITIALS}{SEQ}/{FY}", "ABC", 47, oct2026, "Ganesh Shetty")).toBe("ABC/GS0047/26-27");
    expect(formatPONumber("{PREFIX}/{INITIALS}{SEQ3}/{FY}", "ABC", 42, feb2027, "ganesh kumar shetty")).toBe("ABC/GS042/26-27");
  });

  it("keeps the two older formats exactly as before", () => {
    expect(formatPONumber("YEAR_CONTINUOUS", "PO", 86, oct2026)).toBe("PO-2026-0086");
    expect(formatPONumber("FY_RESET", "PO", 1, oct2026)).toBe("PO/2026-27/0001");
    expect(poCounterKey("YEAR_CONTINUOUS", oct2026)).toBe("PO:SEQ");
    expect(poCounterKey("FY_RESET", oct2026)).toBe("PO:2026-27");
  });

  it("restarts the serial each financial year only when the number shows the year", () => {
    expect(poCounterKey("{PREFIX}/{INITIALS}{SEQ}/{FY}", feb2027)).toBe("PO:2026-27");
    expect(poCounterKey("{PREFIX}{SEQ}", feb2027)).toBe("PO:SEQ");
  });

  it("takes initials from first and last names", () => {
    expect(initialsOf("Amit Gupta")).toBe("AG");
    expect(initialsOf("Administrator")).toBe("AD");
    expect(initialsOf("  ")).toBe("XX");
  });

  it("rejects formats without a serial or with unknown items", () => {
    expect(patternProblem("{PREFIX}/{FY}")).toContain("{SEQ}");
    expect(patternProblem("{PREFIX}/{NAME}{SEQ}")).toContain("Unknown");
    expect(patternProblem("{PREFIX} {SEQ}")).toContain("Only letters");
    expect(patternProblem("{PREFIX}/{INITIALS}{SEQ}/{FY}")).toBeNull();
  });
});
