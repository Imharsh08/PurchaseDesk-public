import { describe, expect, it } from "vitest";
import { billSchema, poLineSchema, quotationLineSchema } from "./validation";

describe("numbers pasted with commas", () => {
  it("are read on PO lines", () => {
    const line = poLineSchema.parse({ itemId: 3, description: "Royalene511", quantity: "1,000", rate: "66,750.00", discountPct: "", gstRate: 18 });
    expect(line).toMatchObject({ quantity: 1000, rate: 66750, discountPct: 0 });
  });

  it("are read on quotations and bills (₹ and Rs too)", () => {
    expect(quotationLineSchema.parse({ indentItemId: 1, rate: "₹ 6,675", gstRate: 18 }).rate).toBe(6675);
    expect(quotationLineSchema.parse({ indentItemId: 1, rate: "", gstRate: 18 }).rate).toBeNull();
    const bill = billSchema.parse({
      invoiceNo: "0922",
      invoiceDate: "2026-10-13",
      taxableAmount: "8,00,000",
      taxAmount: "1,44,000.00",
      totalAmount: "Rs. 9,44,000/-",
      lines: [{ grnItemId: 1, billedQty: "2,500", billedRate: "320" }],
    });
    expect(bill).toMatchObject({ taxableAmount: 800000, taxAmount: 144000, totalAmount: 944000, lines: [{ billedQty: 2500, billedRate: 320 }] });
  });

  it("still rejects text that isn't a number", () => {
    expect(poLineSchema.safeParse({ itemId: 3, description: "x", quantity: "12 Kg", rate: "1", gstRate: 18 }).success).toBe(false);
  });
});
