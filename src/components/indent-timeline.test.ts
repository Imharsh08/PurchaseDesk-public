import { describe, expect, it } from "vitest";
import type { FmsCell } from "@/lib/fms";
import type { StepCode } from "@/lib/fms-steps";
import { foldedSteps } from "./indent-timeline";

const PO: StepCode[] = ["ST3", "ST4", "ST5", "ST6", "ST7", "ST8", "ST9"];
const cell = (state: FmsCell["state"]): FmsCell => ({ planned: null, actual: null, delayHours: null, state, doer: null, note: null, link: null, action: null });
const cells = (states: Partial<Record<StepCode, FmsCell["state"]>>) =>
  Object.fromEntries(PO.map((c) => [c, cell(states[c] ?? "waiting")])) as Record<StepCode, FmsCell>;

describe("folded timeline", () => {
  it("shows the step before, the one due and the one after", () => {
    expect(foldedSteps(PO, cells({ ST3: "done", ST4: "done", ST5: "pending" }), "ST5")).toEqual(["ST4", "ST5", "ST6"]);
  });

  it("skips steps that don't apply when picking before and after", () => {
    expect(foldedSteps(PO, cells({ ST3: "done", ST4: "na", ST5: "done", ST6: "done", ST7: "na", ST8: "pending" }), "ST8")).toEqual(["ST6", "ST8", "ST9"]);
  });

  it("always keeps an overdue step", () => {
    expect(foldedSteps(PO, cells({ ST3: "overdue", ST4: "done", ST5: "done", ST6: "pending" }), "ST6")).toEqual(["ST3", "ST5", "ST6", "ST7"]);
  });

  it("with nothing due, shows only the last step done", () => {
    expect(foldedSteps(PO, cells({ ST3: "done", ST4: "na", ST5: "late", ST6: "done", ST7: "na", ST8: "done", ST9: "done" }), null)).toEqual(["ST9"]);
  });
});
