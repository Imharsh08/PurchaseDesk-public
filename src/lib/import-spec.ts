/**
 * Excel import templates. Shared by the browser (template download, column matching, preview)
 * and the server (which validates every row again before writing).
 */

export type ImportKind = "items" | "vendors" | "stock" | "rates" | "units";

export type ImportColumn = { key: string; header: string; required?: boolean; example: string | number; help?: string };

export const IMPORTS: Record<ImportKind, { title: string; description: string; matchOn: string; columns: ImportColumn[] }> = {
  items: {
    title: "Items",
    description: "Item master with HSN, GST and stock settings. Existing item codes are updated.",
    matchOn: "Item code",
    columns: [
      { key: "sku", header: "Item code", required: true, example: "RM-CB-N330" },
      { key: "name", header: "Item name", required: true, example: "Carbon Black N330" },
      { key: "category", header: "Category", example: "Filler" },
      { key: "uom", header: "Unit", required: true, example: "Kg", help: "Kg, Ltr, Nos, Mtr…" },
      { key: "hsnCode", header: "HSN", example: "28030010" },
      { key: "gstRate", header: "GST %", required: true, example: 18 },
      { key: "description", header: "Description", example: "" },
      { key: "minStock", header: "Minimum stock", example: 500 },
      { key: "reorderQty", header: "Re-order qty", example: 250 },
      { key: "packUnit", header: "Pack unit", example: "Bale", help: "Bale, Drum, Bag…" },
      { key: "packSize", header: "Qty per pack", example: 25, help: "In the item's unit: 1 Bale = 25 Kg" },
    ],
  },
  vendors: {
    title: "Vendors",
    description: "Supplier master with GST, MSME and credit terms. Existing vendor codes are updated.",
    matchOn: "Vendor code",
    columns: [
      { key: "code", header: "Vendor code", required: true, example: "V-SHREE" },
      { key: "name", header: "Vendor name", required: true, example: "Shree Polymers" },
      { key: "contactPerson", header: "Contact person", example: "Rajesh Kumar" },
      { key: "phone", header: "Phone", example: "+91 98xxx xxxxx" },
      { key: "email", header: "Email", example: "sales@shreepolymers.in" },
      { key: "address", header: "Address", example: "Plot 12, Industrial Area" },
      { key: "city", header: "City", example: "Ghaziabad" },
      { key: "state", header: "State", example: "Uttar Pradesh", help: "State name or 2-digit GST code" },
      { key: "pincode", header: "PIN", example: "201001" },
      { key: "gstin", header: "GSTIN", example: "09ABCDE1234F1Z5" },
      { key: "pan", header: "PAN", example: "ABCDE1234F" },
      { key: "paymentTerms", header: "Payment terms", example: "30 days from invoice" },
      { key: "creditDays", header: "Credit days", example: 30 },
      { key: "leadTimeDays", header: "Lead time days", example: 7 },
      { key: "msme", header: "MSME (Yes/No)", example: "Yes" },
      { key: "msmeCategory", header: "MSME category", example: "Micro", help: "Micro, Small or Medium" },
      { key: "msmeNumber", header: "Udyam no.", example: "UDYAM-UP-28-0012345" },
      { key: "certification", header: "Certification", example: "ISO 9001", help: "ISO 9001, ISO other, Customer, None" },
      { key: "notes", header: "Notes", example: "Other email: accounts@shreepolymers.in" },
    ],
  },
  stock: {
    title: "Opening stock",
    description: "Current stock per item (and optionally minimum / re-order / pack). Recorded as a stock count.",
    matchOn: "Item code",
    columns: [
      { key: "sku", header: "Item code", required: true, example: "RM-CB-N330" },
      { key: "quantity", header: "Stock qty", required: true, example: 180, help: "In the item's unit" },
      { key: "minStock", header: "Minimum stock", example: 500 },
      { key: "reorderQty", header: "Re-order qty", example: 250 },
      { key: "packUnit", header: "Pack unit", example: "Bale" },
      { key: "packSize", header: "Qty per pack", example: 25 },
    ],
  },
  rates: {
    title: "Vendor items",
    description: "Which vendor supplies which item, one row per vendor + item. Rate is optional. Existing pairs are updated.",
    matchOn: "Vendor code + Item code",
    columns: [
      { key: "vendorCode", header: "Vendor code", required: true, example: "V-SHREE" },
      { key: "sku", header: "Item code", required: true, example: "RM-CB-N330" },
      { key: "rate", header: "Rate (before GST)", example: 92.5, help: "Leave blank if not agreed yet" },
      { key: "vendorItemCode", header: "Vendor item code", example: "N330-HS" },
      { key: "leadTimeDays", header: "Lead time days", example: 7 },
      { key: "preferred", header: "Preferred (Yes/No)", example: "Yes" },
      { key: "notes", header: "Notes", example: "Only in emergency" },
    ],
  },
  units: {
    title: "Unit conversions",
    description: "Other units an item is indented or ordered in (25 Kg = 1 Bag), so stock and reports add up. Kg / Ton and Ltr / ml need no row.",
    matchOn: "Item code + Unit",
    columns: [
      { key: "sku", header: "Item code", required: true, example: "SKU-010" },
      { key: "unit", header: "Unit", required: true, example: "Kg", help: "The other unit, e.g. Kg for an item kept in Bag" },
      { key: "unitQty", header: "Qty in this unit", example: 25, help: "Blank = 1" },
      { key: "itemQty", header: "= Qty in item unit", example: 1, help: "25 Kg = 1 Bag. Blank: row skipped. 0: removes it" },
    ],
  },
};

export const IMPORT_CHUNK = 100;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps a sheet's header row to template keys (case, spaces and punctuation ignored). */
export function matchColumns(kind: ImportKind, headers: string[]) {
  const byHeader = new Map(IMPORTS[kind].columns.flatMap((c) => [[norm(c.header), c.key] as const, [norm(c.key), c.key] as const]));
  return headers.map((h) => byHeader.get(norm(String(h ?? ""))) ?? null);
}

export function yes(value: unknown) {
  return /^(y|yes|true|1|✓)$/i.test(String(value ?? "").trim());
}
