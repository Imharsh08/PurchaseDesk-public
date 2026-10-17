/**
 * Renders a sample PO (demo company data) to compare layouts.
 *   npx tsx scripts/sample-po.mts [out.pdf] [logo.png] [logo2.png]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { renderPOPdfDocument } from "../src/lib/pdf/po-pdf";

/** Minimal solid-colour PNG, used when no logo file is given. */
function placeholderPng(w: number, h: number, [r, g, b]: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const [out = "sample-po.pdf", logoFile, logo2File] = process.argv.slice(2);

const pdf = await renderPOPdfDocument({
  draft: false,
  poNumber: "PO-2026-0085",
  poDate: new Date("2026-09-29T06:00:00Z"),
  quotationRef: null,
  quotationDate: new Date("2026-09-29T00:00:00Z"),
  terms:
    "Delivery Period: 2-3 Days\nTransport: Thru Courier\nPacking & forwarding: As per standard packing\nGST: 18% IGST\nPayment terms: Immediate\nCalibration: Manufacturer calibration certificate Free of Cost required.",
  billingAddress:
    "Demo Rubber Industries Pvt. Ltd.\nGSTIN: 27AAACY5678G1ZW (Plant 2)\nPlot 12, MIDC Industrial Area,\nPune, PIN-411001, Maharashtra\nTel.: +91-20-0000-0000",
  shippingAddress:
    "Demo Rubber Industries Pvt. Ltd. (Plant 2)\nPlot 7, MIDC Chakan,\nPune, PIN-410501, Maharashtra\nStore: +91-20-0000-0001",
  company: {
    name: "Demo Rubber Industries Pvt. Ltd.",
    address: "Plot 12, MIDC Industrial Area,\nPune (MH) – 411001, India",
    city: "Pune",
    stateName: "Maharashtra",
    pincode: "411001",
    phone: "+91-20-0000-0000",
    email: "purchase@demo-rubber.example",
    website: "www.demo-rubber.example",
    gstin: "27AAACY5678G1ZW",
    signatoryName: "Amit Gupta",
    signatoryPhone: "+91-90000 00000",
    signatoryEmail: "purchase@demo-rubber.example",
    logo: logoFile ? new Uint8Array(readFileSync(logoFile)) : placeholderPng(237, 58, [30, 64, 175]),
    logo2: logo2File ? new Uint8Array(readFileSync(logo2File)) : placeholderPng(150, 70, [220, 80, 80]),
  },
  vendor: {
    name: "RubberSource Inc.",
    contactPerson: "Raj Patel",
    address: "101 Polymer Plaza",
    city: "Mumbai",
    phone: "9821012345",
  },
  items: [{ description: "RMA Cutting", sku: "ITEM-006", uom: "Kg", quantity: 500, rate: 30, discountPct: 0, remarks: null }],
  preparedBy: { name: "Amit Gupta", email: "purchase@demo-rubber.example" },
});

writeFileSync(out, pdf);
console.log(`wrote ${out} (${pdf.length} bytes)`);
