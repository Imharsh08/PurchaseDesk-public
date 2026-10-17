import { describe, expect, it } from "vitest";
import { aiReading } from "./ai";

// What Gemini returned for the sample invoice (a scan), trimmed.
const answer = {
  invoiceNo: "FBD/0922/26-27",
  invoiceDate: "2026-10-13",
  orderNo: "ABC/GS042/26-27",
  vehicleNo: "HR38 AG 9767",
  gstins: ["06AAACZ9876K1ZI", "09AAACX1234F1ZL", "09AAACX1234F1ZM"],
  lines: [
    { description: "SYNTHETIC RUBBER EPDM ROYALENE 580HT\n100 BAGS", hsn: "40027000", qty: 2500, unit: "KGS", rate: 320, amount: 800000 },
    { description: "SYNTHETIC RUBBER EPDM ROYALENE OG\nEPDM 563 (10 BAGS)", hsn: "40027000", qty: 2670, unit: "KGS", rate: 250, amount: 66750 },
  ],
  charges: [{ description: "SALES FREIGHT 18% (INTER-STATE)", amount: 4000, percent: 18 }],
  taxes: [{ label: "IGST", amount: 156735 }],
  grandTotal: 1027485,
};

describe("an invoice read by AI", () => {
  const r = aiReading(answer);

  it("keeps the header and only GSTINs whose check character agrees", () => {
    expect(r.source).toBe("ai");
    expect(r.header.invoiceNo?.value).toBe("FBD/0922/26-27");
    expect(r.header.vehicleNo?.value).toBe("HR38AG9767");
    expect(r.gstins).toEqual(["06AAACZ9876K1ZI", "09AAACX1234F1ZL"]);
  });

  it("checks every line the same way as the rules (a slip is worked out from the amount)", () => {
    expect(r.lines[0]).toMatchObject({ description: "SYNTHETIC RUBBER EPDM ROYALENE 580HT 100 BAGS", qty: 2500, unit: "kg", consistent: true });
    expect(r.lines[1]).toMatchObject({ qty: 267, rate: 250 });
    expect(r.lines[1].notes[0]).toContain("read as 2,670");
  });

  it("adds up the totals", () => {
    expect(r.totals).toMatchObject({ items: 866750, charges: 4000, tax: 156735, grandTotal: 1027485, addsUp: true });
  });
});
