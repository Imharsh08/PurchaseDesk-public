import { describe, expect, it } from "vitest";
import { convertQty, describeFactor, sameUnit, toItemQty, unitFactor, unitOptions, type UnitItem } from "./units";

const n550: UnitItem = { uom: "Bag", packUnit: "Bag", packSize: 25, units: [{ unit: "Kg", factor: 0.04 }] };
const zinc: UnitItem = { uom: "Kg", packUnit: "Kg", packSize: 1, units: [{ unit: "Bag", factor: 25 }] };
const oil: UnitItem = { uom: "Ltr", packUnit: "Drum", packSize: 200, units: [] };

describe("unitFactor", () => {
  it("is 1 for the item's own unit, whatever the spelling", () => {
    expect(unitFactor(zinc, "KGS")).toBe(1);
    expect(sameUnit("Nos", "Pcs")).toBe(true);
  });

  it("uses item conversions and the pack", () => {
    expect(unitFactor(n550, "Kg")).toBe(0.04);
    expect(unitFactor(zinc, "Bag")).toBe(25);
    expect(unitFactor(oil, "Drum")).toBe(200);
  });

  it("converts standard measures, also through an item conversion", () => {
    expect(unitFactor(zinc, "Ton")).toBe(1000);
    expect(unitFactor(oil, "ml")).toBe(0.001);
    expect(unitFactor(n550, "Ton")).toBeCloseTo(40);
    expect(unitFactor(n550, "MT")).toBeCloseTo(40);
  });

  it("returns null when unknown", () => {
    expect(unitFactor(n550, "Box")).toBeNull();
    expect(unitFactor({ uom: "Bag", packUnit: null, packSize: null, units: [] }, "Kg")).toBeNull();
  });

  it("ignores a pack in the item's own unit (1 Bag = 25 Bag)", () => {
    expect(unitFactor({ uom: "Bag", packUnit: "Bag", packSize: 25, units: [] }, "Kg")).toBeNull();
  });
});

describe("toItemQty / describeFactor", () => {
  it("converts", () => {
    expect(toItemQty(n550, 3000, "Kg")).toBeCloseTo(120);
    expect(toItemQty(n550, 2, "Box")).toBeNull();
  });
  it("describes the readable way round", () => {
    expect(describeFactor("Kg", 0.04, "Bag")).toBe("1 Bag = 25 Kg");
    expect(describeFactor("Drum", 200, "Ltr")).toBe("1 Drum = 200 Ltr");
  });
});

describe("unit dropdowns", () => {
  // Kept in Bale; 1 Bale = 25 Kg (units sheet).
  const bale: UnitItem = { uom: "Bale", packUnit: null, packSize: null, units: [{ unit: "Kg", factor: 0.04 }] };

  it("offer the item's unit, its conversions and the standard measures they lead to", () => {
    expect(unitOptions(bale)).toEqual(["Bale", "Kg", "Ton", "g"]);
    expect(unitOptions({ uom: "Pcs", packUnit: "Box", packSize: 50, units: [] })).toEqual(["Pcs", "Box"]);
  });

  it("convert between any two of them", () => {
    expect(convertQty(bale, 250, "Kg", "Bale")).toBeCloseTo(10);
    expect(convertQty(bale, 2, "Bale", "Kg")).toBeCloseTo(50);
    expect(convertQty(bale, 1, "Ton", "Bale")).toBeCloseTo(40);
    expect(convertQty(bale, 3, "Nos", "Bale")).toBeNull();
  });
});
