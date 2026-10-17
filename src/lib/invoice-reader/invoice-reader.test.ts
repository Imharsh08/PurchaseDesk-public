import { describe, expect, it } from "vitest";
import type { DocText, Word } from "./geometry";
import { convert, matchLines } from "./match";
import { findGstins, findVehicleNo, gstinCheckChar, isValidGstin, parseDate, parseNumber } from "./parse";
import { billFigures, readInvoiceText, reconcile } from "./reading";

/** Words laid out like a page: each row is [y, [x, text], [x, text] …]; ~7 px per character, 12 px tall. */
function page(rows: [number, ...[number, string][]][]): DocText {
  const words: Word[] = rows.flatMap(([y, ...cells]) =>
    cells.flatMap(([x, text]) => {
      let at = x;
      return text.split(" ").map((t) => {
        const w = { text: t, x0: at, x1: at + t.length * 7, y0: y, y1: y + 12 };
        at = w.x1 + 4;
        return w;
      });
    }),
  );
  return { pages: [{ width: 1000, height: 1400, words }], source: "text" };
}

describe("parse", () => {
  it("reads Indian and Western amounts, and OCR slips", () => {
    expect(parseNumber("8,00,000.00")).toBe(800000);
    expect(parseNumber("2,500.000")).toBe(2500);
    expect(parseNumber("Rs. 11,01,530.00")).toBe(1101530);
    expect(parseNumber("1.67.310.00")).toBe(167310);
    expect(parseNumber("(250.00")).toBe(250);
    expect(parseNumber("4,0O0.00")).toBe(4000);
    expect(parseNumber("KGS")).toBeNull();
    expect(parseNumber("13-Oct-26")).toBeNull();
  });

  it("reads dates day first, with misread months", () => {
    expect(parseDate("13-Oct-26")).toBe("2026-10-13");
    expect(parseDate("Dated 13/10/2026")).toBe("2026-10-13");
    expect(parseDate("13.10.26")).toBe("2026-10-13");
    expect(parseDate("13-0ct-26")).toBe("2026-10-13");
    expect(parseDate("26 September 2026")).toBe("2026-09-26");
    expect(parseDate("31/02/2026")).toBeNull();
  });

  it("accepts a GSTIN only when its check character agrees, repairing OCR slips", () => {
    const g = "27AAPFU0939F1Z" + gstinCheckChar("27AAPFU0939F1Z");
    expect(isValidGstin(g)).toBe(true);
    expect(findGstins(`GSTIN/UIN: ${g.slice(0, 2)} ${g.slice(2)}`)).toEqual([g]);
    // O for 0 in the PAN's digits, 5 for S in its letters.
    expect(findGstins(g.replace("0939", "O939").replace("PFU", "PFU"))).toEqual([g]);
    const wrong = g.slice(0, 14) + (g[14] === "A" ? "B" : "A");
    expect(findGstins(wrong)).toEqual([]);
  });

  it("finds vehicle numbers", () => {
    expect(findVehicleNo("Motor Vehicle No. HR38AG9767")).toBe("HR38AG9767");
    expect(findVehicleNo("UP 15 AB 1234")).toBe("UP15AB1234");
    expect(findVehicleNo("Invoice FBD/0922/26-27")).toBeNull();
  });
});

describe("a line's quantity × rate = amount", () => {
  const line = { description: "x", hsn: null, unit: "kg" };
  it("keeps a consistent line", () => {
    expect(reconcile({ ...line, qty: 2500, rate: 320, amount: 800000 })).toMatchObject({ qty: 2500, consistent: true, notes: [] });
  });
  it("works out a misread quantity from amount ÷ rate", () => {
    const r = reconcile({ ...line, qty: 23000, rate: 320, amount: 800000 });
    expect(r.qty).toBe(2500);
    expect(r.notes[0]).toContain("read as 23,000");
  });
  it("spots a lost decimal point and keeps a cleanly printed number", () => {
    // "320.00" read as "32000", "2,500" as "2,000": the rate lost ".00".
    expect(reconcile({ ...line, qty: 2000, rate: 32000, amount: 800000, raw: { qty: "2,000", rate: "32000", amount: "8,00,000.00" } })).toMatchObject({ qty: 2500, rate: 320 });
    // A clean "320.00" stays; the garbled quantity gives way.
    expect(reconcile({ ...line, qty: 23000, rate: 320, amount: 800000, raw: { qty: "{23000", rate: "320.00", amount: "8,00,000.00" } })).toMatchObject({ qty: 2500, rate: 320 });
  });
  it("works out a missing rate or amount", () => {
    expect(reconcile({ ...line, qty: 267, rate: null, amount: 66750 }).rate).toBe(250);
    expect(reconcile({ ...line, qty: 251, rate: 250, amount: null }).amount).toBe(62750);
  });
});

// A digital (Tally-style) invoice: boxed header with values under their labels, CGST + SGST.
const digital = page([
  [40, [380, "Tax Invoice"]],
  [80, [40, "ACME POLYMERS PVT LTD"], [560, "Invoice No."], [700, "e-Way Bill No."], [840, "Dated"]],
  [96, [40, "GSTIN/UIN: 06AAACZ9876K1ZI"], [560, "ACM/101/26-27"], [700, "342354862289"], [840, "13-Oct-26"]],
  [130, [560, "Buyer's Order No."], [840, "Dated"]],
  [146, [560, "ABCPO354"], [840, "26-Sep-26"]],
  [180, [560, "Motor Vehicle No."]],
  [196, [560, "HR38AG9767"]],
  [260, [40, "Sl"], [70, "Description of Goods"], [420, "HSN/SAC"], [520, "Quantity"], [620, "Rate"], [700, "per"], [820, "Amount"]],
  [290, [40, "1"], [70, "EPDM ROYALENE 580HT"], [420, "40027000"], [510, "2,500.000 KGS"], [615, "320.00"], [700, "KGS"], [800, "8,00,000.00"]],
  [306, [90, "100 BAGS"]],
  [330, [40, "2"], [70, "CARBON BLACK N550"], [420, "28030010"], [510, "1,000.000 KGS"], [615, "95.00"], [700, "KGS"], [810, "95,000.00"]],
  [370, [300, "FREIGHT 18%"], [820, "4,000.00"]],
  [390, [300, "CGST"], [810, "80,910.00"]],
  [410, [300, "SGST"], [810, "80,910.00"]],
  [450, [420, "Total"], [510, "3,500.000 KGS"], [780, "Rs. 10,60,820.00"]],
  [490, [40, "Amount Chargeable (in words)"]],
]);

describe("reading a digital invoice", () => {
  const r = readInvoiceText(digital);

  it("reads the header fields from their boxes", () => {
    expect(r.header.invoiceNo?.value).toBe("ACM/101/26-27");
    expect(r.header.invoiceDate?.value).toBe("2026-10-13");
    expect(r.header.orderNo?.value).toBe("ABCPO354");
    expect(r.header.ewayBill?.value).toBe("342354862289");
    expect(r.header.vehicleNo?.value).toBe("HR38AG9767");
  });

  it("reads the item lines, with continuation text on its item", () => {
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ description: "EPDM ROYALENE 580HT 100 BAGS", qty: 2500, unit: "kg", rate: 320, amount: 800000, hsn: "40027000", consistent: true });
    expect(r.lines[1]).toMatchObject({ description: "CARBON BLACK N550", qty: 1000, rate: 95, amount: 95000 });
  });

  it("separates freight and GST, and checks the total", () => {
    expect(r.charges).toEqual([{ description: "FREIGHT 18%", amount: 4000, percent: 18 }]);
    expect(r.taxes).toEqual([
      { label: "CGST", amount: 80910 },
      { label: "SGST", amount: 80910 },
    ]);
    expect(r.totals).toMatchObject({ items: 895000, charges: 4000, tax: 161820, grandTotal: 1060820, addsUp: true, taxWorkedOut: false });
  });

  it("gives the bill form freight with its GST", () => {
    // Freight 4,000 + 18% = 4,720; GST on items = 1,61,820 − 720.
    expect(billFigures(r)).toEqual({ taxable: 895000, tax: 161100, otherCharges: 4720, total: 1060820 });
  });
});

// A scan: numbers printed half a line above their text, notes indented, the IGST misread.
const scan: DocText = {
  ...page([
    [260, [420, "HSN/SAC"], [520, "Quantity"], [620, "Rate"], [700, "per"], [820, "Amount"]],
    [284, [420, "40027000"], [515, "{23000"], [615, "320.00"], [700, "KGS"], [800, "8,00,000.00"]],
    [298, [70, "SYNTHETIC RUBBER EPDM ROYALENE 580HT"]],
    [318, [92, "100 BAGS"], [420, "40027000"], [515, "267.000"], [615, "250.00"], [700, "KGS"], [810, "66,750.00"]],
    [334, [70, "SYNTHETIC RUBBER EPDM ROYALENE OG"]],
    [352, [92, "EPDM 563 (10 BAGS)"]],
    [390, [820, "4,000.00"]],
    [404, [300, "SALES FREIGHT 18%"], [800, "1,66,030.00"]],
    [420, [330, "IGST"]],
    [470, [780, "Rs. 10,25,060.00"]],
    [500, [40, "Amount Chargeable (in words)"]],
  ]),
  source: "ocr",
};

describe("reading a scan", () => {
  const r = readInvoiceText(scan);

  it("keeps each note on its own item and repairs the misread quantity", () => {
    expect(r.lines.map((l) => [l.description, l.qty, l.rate, l.amount])).toEqual([
      ["SYNTHETIC RUBBER EPDM ROYALENE 580HT 100 BAGS", 2500, 320, 800000],
      ["SYNTHETIC RUBBER EPDM ROYALENE OG EPDM 563 (10 BAGS)", 267, 250, 66750],
    ]);
  });

  it("pairs freight and IGST with their amounts, and works out GST from the total", () => {
    expect(r.charges).toMatchObject([{ amount: 4000, percent: 18 }]);
    expect(r.taxes).toEqual([{ label: "IGST", amount: 166030 }]);
    // 8,66,750 + 4,000 + GST = 10,25,060 → GST 1,54,310 (the 1,66,030 read doesn't add up).
    expect(r.totals).toMatchObject({ tax: 154310, taxWorkedOut: true, taxRead: 166030, addsUp: true });
  });
});

describe("matching invoice lines to PO lines", () => {
  const lines = readInvoiceText(digital).lines;
  const targets = [
    // Ordered in bags; the item is kept in Kg with 1 Bag = 25 Kg.
    { key: 7, description: "Carbon Black N-550", uom: "Bag", unitItem: { uom: "Kg", packUnit: "Bag", packSize: 25, units: [] }, rate: 2375, qty: 40 },
    { key: 3, description: "EPDM 580HT", sku: "RM-EPDM-580", uom: "Kg", rate: 320, qty: 2500 },
  ];

  it("matches grade numbers run into the name, and ignores our own SKU", () => {
    const line = { description: "SYNTHETIC RUBBER EPDM 511 (10 BAGS)", hsn: null, unit: "kg", qty: 251, rate: 250, amount: 62750, consistent: true, notes: [] };
    const other = { ...line, description: "SYNTHETIC RUBBER EPDM ROYALENE 580HT", qty: 2500, rate: 320, amount: 800000 };
    expect(matchLines([other, line], [{ key: 344, description: "Royalene511", sku: "SKU-123", uom: "Bale", qty: 10 }]).map((m) => m.target)).toEqual([null, 344]);
  });

  it("pairs by description, rate and quantity", () => {
    expect(matchLines(lines, targets).map((m) => m.target)).toEqual([3, 7]);
  });

  it("converts the invoice's unit to the line's", () => {
    expect(convert(lines[1], targets[0])).toEqual({ qty: 40, rate: 2375, note: "1,000 kg = 40 Bag", unitProblem: false });
    expect(convert(lines[0], { key: 1, description: "x", uom: "Nos" }).unitProblem).toBe(true);
    // A bale with no Kg conversion recorded: not converted (never "251 kg = 251 Bale").
    expect(convert(lines[0], { key: 2, description: "Royalene511", uom: "Bale", unitItem: { uom: "Bale", packUnit: "Bale", packSize: 1, units: [] } })).toMatchObject({ qty: 2500, unitProblem: true });
    // …and with the units sheet's conversion (1 Bale = 25 Kg), converted.
    expect(convert(lines[0], { key: 2, description: "Royalene511", uom: "Bale", unitItem: { uom: "Bale", packUnit: null, packSize: null, units: [{ unit: "Kg", factor: 0.04 }] } })).toMatchObject({ qty: 100, rate: 8000 });
  });

  it("corrects a decimal slip that the amount can't show, using the PO rate", () => {
    // 25,000 × 32.00 = 8,00,000 adds up, but the PO rate is 320.
    const c = convert({ qty: 25000, rate: 32, unit: "kg" }, { key: 3, description: "EPDM 580HT", uom: "Kg", rate: 320 });
    expect(c).toMatchObject({ qty: 2500, rate: 320 });
    expect(c.note).toContain("decimal point");
  });
});

describe("the invoice date", () => {
  it("is the one by the invoice number, not the buyer's order date", () => {
    // The invoice's own date unreadable; the order box below has one; the e-invoice Ack Date is at the top.
    const r = readInvoiceText(
      page([
        [20, [40, "Ack Date : 13-Oct-26"]],
        [80, [560, "Invoice No."], [840, "Dated"]],
        [96, [560, "ACM/101/26-27"], [840, "~~~"]],
        [130, [560, "Buyer's Order No."], [840, "Dated"]],
        [146, [560, "ABCPO354"], [840, "26-Sep-26"]],
      ]),
    );
    expect(r.header.invoiceDate?.value).toBe("2026-10-13");
  });
});

describe("a scan with garbled labels", () => {
  // No readable "Total" or "IGST": the total line has numbers but is no item; the GST is the
  // unlabelled amount that is exactly 18% of items + freight; the total is worked out.
  const r = readInvoiceText({
    ...page([
      [260, [420, "HSN"], [520, "Quantity"], [620, "Rate"], [820, "Amount"]],
      [290, [70, "EPDM 580HT"], [520, "2,500.000"], [615, "320.00"], [800, "8,00,000.00"]],
      [330, [70, "EPDM 563"], [520, "267.000"], [615, "250.00"], [810, "66,750.00"]],
      [360, [810, "8,66,750.00"]],
      [390, [300, "FREIGHT"], [820, "4,000.00"]],
      [410, [300, "lE5I"], [800, "1,56,735.00"]],
      [450, [520, "3,018.000"], [790, "jl,O1,53OOO"]],
      [490, [40, "Amount Chargeable (in words)"]],
    ]),
    source: "ocr",
  });

  it("keeps the total line out of the items", () => {
    expect(r.lines.map((l) => l.amount)).toEqual([800000, 66750]);
  });

  it("finds the GST by its rate and works out the total", () => {
    expect(r.taxes).toEqual([{ label: "GST", amount: 156735 }]);
    expect(r.totals).toMatchObject({ items: 866750, charges: 4000, tax: 156735, grandTotal: 1027485, totalWorkedOut: true });
  });
});

describe("the grand total", () => {
  it("ignores an amount too large to be this invoice's total", () => {
    const misread = page([
      [260, [420, "HSN"], [520, "Quantity"], [620, "Rate"], [820, "Amount"]],
      [290, [70, "EPDM 580HT"], [520, "2,500.000"], [615, "320.00"], [800, "8,00,000.00"]],
      [330, [300, "IGST"], [810, "1,44,000.00"]],
      [370, [420, "Total"], [760, "5,26,50,000.00"], [880, "9,44,000.00"]],
      [400, [40, "Amount Chargeable (in words)"]],
    ]);
    expect(readInvoiceText(misread).totals).toMatchObject({ grandTotal: 944000, addsUp: true });
  });
});
