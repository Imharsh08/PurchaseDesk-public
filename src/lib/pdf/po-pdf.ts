import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { TIME_ZONE, formatAmount, formatQty } from "@/lib/format";

/**
 * The purchase order PDF, in a classic Indian PO layout
 * (letterhead with two logos, boxed PURCHASE ORDER block with vendor, billing and shipping
 * columns, S. No./Qty./Particulars/Rates/Per
 * table, TERMS & CONDITIONS box, signatory). Pure JS, so it runs on Node and Cloudflare Workers.
 */

export type POPdfData = {
  draft: boolean;
  poNumber: string | null;
  poDate: Date | null;
  /** Amendment number (0 = original) and when it was revised. */
  revision?: number;
  revisedAt?: Date | null;
  quotationRef: string | null;
  quotationDate: Date | null;
  terms: string | null;
  /** Printed as entered in the "Billing Details" and "Shipping Address" boxes; first line bold. */
  billingAddress: string;
  shippingAddress: string;
  company: {
    name: string;
    address: string | null;
    city: string | null;
    stateName: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    gstin: string | null;
    signatoryName: string | null;
    signatoryPhone: string | null;
    signatoryEmail: string | null;
    logo: Uint8Array | null;
    logo2: Uint8Array | null;
  };
  vendor: {
    name: string;
    contactPerson: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
  };
  items: {
    description: string;
    sku: string;
    uom: string;
    quantity: number;
    rate: number;
    discountPct: number;
    remarks: string | null;
  }[];
  preparedBy: { name: string; email: string };
};

// A4 in points, with the margins of the existing copy.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 36;
const RIGHT = PAGE_W - 36;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 40;

const BODY = 8;
const LINE = 10.2;
const BLACK = rgb(0, 0, 0);
const GREY_TEXT = rgb(0.2, 0.2, 0.2);
const BLUE_FILL = rgb(201 / 255, 218 / 255, 248 / 255); // #c9daf8
const GREY_FILL = rgb(0.953, 0.953, 0.953); // #f3f3f3
const BORDER = 0.75;

// S. No. | Qty. | Particulars | Rates (INR) | Per
const COLS = [42, 74, 281, 74, 56.28];

type Fonts = { regular: PDFFont; bold: PDFFont };

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    date,
  );
}

/** Standard PDF fonts only cover WinAnsi; replace anything else so rendering never throws. */
function sanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text.replace(/\t/g, " ").replace(/₹/g, "Rs."))
      .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Break words longer than the column.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 4) return null;
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function fit(image: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / image.width, maxH / image.height, 1.5);
  return { width: image.width * scale, height: image.height * scale };
}

/** Terms text → numbered lines. Existing "1." / "1)" / "-" prefixes are replaced. */
export function termLines(terms: string | null) {
  return (terms ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(\d+\s*[.)]|[-•*])\s*/, ""))
    .filter(Boolean);
}

export async function renderPOPdfDocument(d: POPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.poNumber ? `Purchase Order ${d.poNumber}` : "Draft Purchase Order");
  pdf.setAuthor(d.company.name);
  pdf.setCreator("PurchaseDesk");

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const clean = sanitizer(fonts.regular);
  const [logo, logo2] = await Promise.all([embedImage(pdf, d.company.logo), embedImage(pdf, d.company.logo2)]);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const pages: PDFPage[] = [page];

  // Coordinates below are measured from the top of the page.
  const text = (
    value: string,
    x: number,
    top: number,
    opts: { font?: PDFFont; size?: number; align?: "left" | "right" | "center"; width?: number; underline?: boolean } = {},
  ) => {
    const font = opts.font ?? fonts.regular;
    const size = opts.size ?? BODY;
    const s = clean(value);
    const w = font.widthOfTextAtSize(s, size);
    let dx = x;
    if (opts.align === "right") dx = x - w;
    if (opts.align === "center") dx = x + ((opts.width ?? 0) - w) / 2;
    const baseline = PAGE_H - top - size * 0.78;
    page.drawText(s, { x: dx, y: baseline, size, font, color: BLACK });
    if (opts.underline) {
      page.drawLine({
        start: { x: dx, y: baseline - 1.2 },
        end: { x: dx + w, y: baseline - 1.2 },
        thickness: 0.5,
        color: BLACK,
      });
    }
    return w;
  };
  const rect = (x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({
      x,
      y: PAGE_H - top - h,
      width: w,
      height: h,
      borderColor: BLACK,
      borderWidth: BORDER,
      ...(fill ? { color: fill } : {}),
    });
  const vline = (x: number, top: number, h: number) =>
    page.drawLine({ start: { x, y: PAGE_H - top }, end: { x, y: PAGE_H - top - h }, thickness: BORDER, color: BLACK });

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    return 40;
  };

  // ── Letterhead ────────────────────────────────────────────────────────────
  const c = d.company;
  if (logo) {
    const s = fit(logo, 140, 30);
    page.drawImage(logo, { x: LEFT + 4, y: PAGE_H - 40 - s.height, width: s.width, height: s.height });
  }
  text(c.name, LEFT + 5, 78, { font: fonts.bold, size: 11 });
  if (logo2) {
    const s = fit(logo2, 80, 36);
    page.drawImage(logo2, { x: PAGE_W / 2 - s.width / 2, y: PAGE_H - 38 - s.height, width: s.width, height: s.height });
  }

  const addressLines = c.address
    ? c.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [[c.city, c.stateName, c.pincode].filter(Boolean).join(", ")].filter(Boolean);
  let hy = 40;
  for (const line of addressLines) {
    text(line, RIGHT - 6, hy, { font: fonts.bold, size: 7.5, align: "right" });
    hy += 12.5;
  }
  const contact = [
    c.phone && `Phone: ${c.phone}`,
    c.email && `Email: ${c.email}`,
    c.website && `Website: ${c.website}`,
  ].filter(Boolean) as string[];
  for (const line of contact) {
    text(line, RIGHT - 6, hy, { size: 7, align: "right" });
    hy += 11.5;
  }
  if (c.gstin) {
    const value = c.gstin;
    const vw = fonts.regular.widthOfTextAtSize(clean(value), 7);
    text(value, RIGHT - 6, hy, { size: 7, align: "right" });
    text("GSTIN: ", RIGHT - 6 - vw, hy, { font: fonts.bold, size: 7, align: "right" });
    hy += 11.5;
  }

  let y = Math.max(hy + 8, 118);
  page.drawLine({ start: { x: LEFT, y: PAGE_H - y }, end: { x: RIGHT, y: PAGE_H - y }, thickness: 0.8, color: BLACK });
  y += 8;

  // ── PURCHASE ORDER box ────────────────────────────────────────────────────
  rect(LEFT, y, WIDTH, 18, BLUE_FILL);
  text("PURCHASE ORDER", LEFT, y + 5, { align: "center", width: WIDTH });
  y += 18;

  // Vendor | Billing Details | Shipping Address
  const third = WIDTH / 3;
  const colW = third - 10;
  type Line = { value: string; bold?: boolean; underline?: boolean };

  const vendorCol: Line[] = [
    { value: `Ref: ${d.poNumber ?? "DRAFT"}${d.revision ? ` (Rev. ${d.revision})` : ""}` },
    ...wrap(
      clean(d.revision && d.revisedAt ? `${longDate(d.poDate ?? new Date())}, revised ${shortDate(d.revisedAt)}` : longDate(d.poDate ?? new Date())),
      fonts.regular,
      BODY,
      colW,
    ).map((value) => ({ value })),
    { value: "" },
    { value: "Vendor:", bold: true, underline: true },
    ...wrap(clean(d.vendor.name), fonts.bold, BODY, colW).map((value) => ({ value, bold: true })),
  ];
  if (d.vendor.contactPerson) vendorCol.push(...wrap(clean(`Attn: ${d.vendor.contactPerson}`), fonts.regular, BODY, colW).map((value) => ({ value })));
  const vAddress = d.vendor.address?.trim() ?? "";
  const vCity = d.vendor.city?.trim() ?? "";
  const vendorAddress =
    vAddress && vCity && !vAddress.toLowerCase().includes(vCity.toLowerCase())
      ? vAddress.includes("\n")
        ? `${vAddress}\n${vCity}`
        : `${vAddress}, ${vCity}`
      : vAddress || vCity;
  if (vendorAddress) vendorCol.push(...wrap(clean(vendorAddress), fonts.regular, BODY, colW).map((value) => ({ value })));
  if (d.vendor.phone) vendorCol.push(...wrap(clean(`Tel.: ${d.vendor.phone}`), fonts.regular, BODY, colW).map((value) => ({ value })));

  /** Heading, then the address as entered with its first line in bold. */
  const addressCol = (heading: string, address: string): Line[] => {
    const out: Line[] = [{ value: heading, bold: true, underline: true }];
    address
      .split(/\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .forEach((raw, i) => {
        const font = i === 0 ? fonts.bold : fonts.regular;
        for (const value of wrap(clean(raw), font, BODY, colW)) out.push({ value, bold: i === 0 });
      });
    return out;
  };
  const columns = [vendorCol, addressCol("Billing Details:", d.billingAddress), addressCol("Shipping Address:", d.shippingAddress)];

  const boxH = Math.max(...columns.map((col) => col.length)) * LINE + 12;
  rect(LEFT, y, WIDTH, boxH);
  vline(LEFT + third, y, boxH);
  vline(LEFT + third * 2, y, boxH);
  columns.forEach((col, c) =>
    col.forEach((l, i) =>
      text(l.value, LEFT + third * c + 5, y + 5 + i * LINE, { font: l.bold ? fonts.bold : fonts.regular, underline: l.underline }),
    ),
  );
  y += boxH + 16;

  // ── Salutation ────────────────────────────────────────────────────────────
  text("Dear Sir,", LEFT, y);
  y += 20;
  const quote = [
    "Further to your quotation",
    d.quotationRef ? ` No. ${d.quotationRef}` : "",
    d.quotationDate ? ` Dtd. ${shortDate(d.quotationDate)}` : "",
  ].join("");
  const intro = `${quote}, we are pleased to place our PO as under. Please supply below material immediately:`;
  for (const line of wrap(clean(intro), fonts.regular, BODY, WIDTH)) {
    text(line, LEFT, y);
    y += LINE;
  }
  y += 6;

  // ── Items table ───────────────────────────────────────────────────────────
  const colX = [LEFT];
  for (let i = 1; i < COLS.length; i++) colX.push(colX[i - 1] + COLS[i - 1]);

  const drawItemHeader = () => {
    const h = 20;
    rect(LEFT, y, WIDTH, h, BLUE_FILL);
    COLS.slice(0, -1).forEach((w, i) => vline(colX[i] + w, y, h));
    ["S. No.", "Qty.", "Particulars", "Rates (INR)", "Per"].forEach((label, i) =>
      text(label, colX[i] + 6, y + 6, { font: fonts.bold }),
    );
    y += h;
  };
  drawItemHeader();

  d.items.forEach((item, index) => {
    const particulars = [
      `${item.description} (ID: ${item.sku})`,
      item.discountPct ? ` (Less ${formatQty(item.discountPct)}% discount)` : "",
      item.remarks ? ` - ${item.remarks}` : "",
    ].join("");
    const pLines = wrap(clean(particulars), fonts.regular, BODY, COLS[2] - 12);
    const h = Math.max(20, pLines.length * LINE + 10);
    if (y + h > PAGE_H - BOTTOM) {
      y = newPage();
      drawItemHeader();
    }
    rect(LEFT, y, WIDTH, h);
    COLS.slice(0, -1).forEach((w, i) => vline(colX[i] + w, y, h));
    const top = y + (pLines.length > 1 ? 5 : 6);
    text(`${index + 1}.`, colX[0], top, { align: "center", width: COLS[0] });
    text(`${formatQty(item.quantity)} ${item.uom}`, colX[1] + 6, top);
    pLines.forEach((line, i) => text(line, colX[2] + 6, top + i * LINE));
    text(formatAmount(item.rate), colX[3] + COLS[3] - 6, top, { align: "right" });
    text(item.uom, colX[4] + 6, top);
    y += h;
  });
  y += 10;

  // ── Terms & conditions ────────────────────────────────────────────────────
  const terms = termLines(d.terms);
  if (terms.length) {
    const drawTermsHeader = () => {
      rect(LEFT, y, WIDTH, 19, GREY_FILL);
      text("TERMS & CONDITIONS", LEFT, y + 5.5, { font: fonts.bold, align: "center", width: WIDTH });
      y += 19;
    };
    if (y + 40 > PAGE_H - BOTTOM) y = newPage();
    drawTermsHeader();
    terms.forEach((term, i) => {
      const lines = wrap(clean(`${i + 1}. ${term}`), fonts.regular, BODY, WIDTH - 12);
      const h = Math.max(20, lines.length * LINE + 10);
      if (y + h > PAGE_H - BOTTOM) {
        y = newPage();
        drawTermsHeader();
      }
      rect(LEFT, y, WIDTH, h);
      lines.forEach((line, j) => text(line, LEFT + 6, y + 6 + j * LINE));
      y += h;
    });
  }

  // ── Closing and signatory ─────────────────────────────────────────────────
  const signName = c.signatoryName || d.preparedBy.name;
  const signLines = [
    c.signatoryPhone && `M: ${c.signatoryPhone}`,
    `Email: ${c.signatoryEmail || c.email || d.preparedBy.email}`,
  ].filter(Boolean) as string[];
  if (y + 24 + 20 + 58 + signLines.length * LINE > PAGE_H - BOTTOM) y = newPage();
  y += 24;
  text("Thanking you, Regards", LEFT, y);
  text(c.name, LEFT, y + LINE, { font: fonts.bold });
  y += LINE + 58;
  text(signName, LEFT, y, { font: fonts.bold });
  signLines.forEach((line, i) => text(line, LEFT, y + (i + 1) * LINE));

  // ── Draft watermark and page numbers (only when needed) ───────────────────
  pages.forEach((p, i) => {
    if (d.draft) {
      p.drawText("DRAFT", {
        x: 150,
        y: 300,
        size: 110,
        font: fonts.bold,
        color: rgb(0.86, 0.15, 0.15),
        opacity: 0.1,
        rotate: degrees(30),
      });
    }
    if (pages.length > 1) {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, {
        x: RIGHT - fonts.regular.widthOfTextAtSize(label, 7),
        y: 22,
        size: 7,
        font: fonts.regular,
        color: GREY_TEXT,
      });
    }
  });

  return pdf.save();
}
