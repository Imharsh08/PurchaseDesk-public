import { z } from "zod";
import { cleanNumber } from "@/lib/format";
import { GSTIN_PATTERN } from "@/lib/states";
import { patternProblem } from "@/lib/po-number";

/** Trimmed optional text; empty string becomes null. */
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Like optionalText, but left out (e.g. by the Excel import) stays undefined = unchanged. */
const keptText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v?.replace(/\s+/g, " ").trim() || null));

/** A number as typed or pasted from a bill or sheet: "66,750.00", "₹ 6,675" (commas, ₹ / Rs ignored). */
const pasted = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === "string" ? cleanNumber(v) : v), schema);

/** Optional number from a text input; empty becomes null. */
const optionalNumber = pasted(
  z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number()]).transform((v) => (v === "" || v === null || v === undefined ? null : v)),
);

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

const optionalGstin = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || GSTIN_PATTERN.test(v), "Enter a valid 15-character GSTIN");

const stateCode = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{2}$/.test(v), "Choose a state");

export const vendorSchema = z.object({
  code: z.string().trim().min(1, "Vendor code is required").max(30).toUpperCase(),
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  contactPerson: optionalText(100),
  email: optionalEmail,
  phone: optionalText(30),
  address: optionalText(),
  city: optionalText(100),
  stateCode,
  pincode: optionalText(10),
  gstin: optionalGstin,
  pan: optionalText(10),
  paymentTerms: optionalText(200),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  // Empty = use the city's first transporter.
  preferredTransport: keptText(100),
  creditDays: optionalNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 365), "Days must be 0–365"),
  msme: z.boolean().default(false),
  msmeNumber: optionalText(40),
  msmeCategory: z
    .enum(["MICRO", "SMALL", "MEDIUM", ""])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  certification: z.enum(["ISO_9001", "ISO_OTHER", "CUSTOMER", "NONE"]).default("NONE"),
  notes: optionalText(1000),
  active: z.boolean().default(true),
});
export type VendorInput = z.input<typeof vendorSchema>;

export const itemSchema = z.object({
  sku: z.string().trim().min(1, "Item code is required").max(50).toUpperCase(),
  name: z.string().trim().min(1, "Item name is required").max(200),
  description: optionalText(1000),
  category: optionalText(100),
  uom: z.string().trim().min(1, "Unit is required").max(20),
  hsnCode: optionalText(10),
  gstRate: z.coerce.number().min(0).max(40),
  specifications: optionalText(2000),
  // How it always comes, whatever the vendor (e.g. Courier); empty = the vendor's transporter.
  preferredTransport: keptText(100),
  active: z.boolean().default(true),
  // Stock settings, in the item's unit
  minStock: optionalNumber.refine((v) => v === null || v >= 0, "Cannot be negative"),
  reorderQty: optionalNumber.refine((v) => v === null || v >= 0, "Cannot be negative"),
  packUnit: optionalText(20),
  packSize: optionalNumber.refine((v) => v === null || v > 0, "Pack size must be more than 0"),
});
export type ItemInput = z.input<typeof itemSchema>;

export const poLineSchema = z.object({
  itemId: z.coerce.number().int().positive("Select an item"),
  description: z.string().trim().min(1).max(300),
  quantity: pasted(z.coerce.number().positive("Quantity must be more than 0").max(1e9)),
  rate: pasted(z.coerce.number().min(0, "Rate cannot be negative").max(1e10)),
  discountPct: pasted(z.coerce.number().min(0).max(100)).default(0),
  gstRate: z.coerce.number().min(0).max(40),
  remarks: optionalText(300),
  /** The unit this line is ordered in (the item's own unit when left out). */
  uom: z.string().trim().max(20).optional(),
});

/** yyyy-mm-dd from a date input; empty becomes null. */
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Invalid date");

export const poSchema = z.object({
  vendorId: z.coerce.number().int().positive("Select a vendor"),
  expectedDeliveryDate: optionalDate,
  quotationRef: optionalText(100),
  quotationDate: optionalDate,
  billingAddress: optionalText(1000),
  deliveryAddress: optionalText(1000),
  paymentTerms: optionalText(200),
  terms: optionalText(5000),
  internalNotes: optionalText(2000),
  items: z.array(poLineSchema).min(1, "Add at least one line item").max(200),
});
export type POInput = z.input<typeof poSchema>;

/** Billing / shipping address book entry. */
export const addressSchema = z.object({
  label: z.string().trim().min(1, "Give the address a short name").max(80),
  details: z.string().trim().min(5, "Enter the address as it should print").max(1000),
  defaultBilling: z.boolean().default(false),
  defaultShipping: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;

export const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  address: optionalText(),
  city: optionalText(100),
  stateCode,
  pincode: optionalText(10),
  gstin: optionalGstin,
  pan: optionalText(10),
  phone: optionalText(100),
  email: optionalEmail,
  website: optionalText(200),
  poPrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  /** PO number format: a pattern such as "{PREFIX}/{INITIALS}{SEQ}/{FY}" (src/lib/po-number.ts). */
  poNumberStyle: z
    .string()
    .trim()
    .min(1, "Enter a format")
    .superRefine((v, ctx) => {
      const problem = patternProblem(v);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  /** Optional: sets the number the next approved PO will get. */
  nextPoNumber: z
    .union([z.literal(""), z.coerce.number().int().min(1, "Must be 1 or more").max(999999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  defaultTerms: optionalText(5000),
  signatoryTitle: optionalText(100),
  signatoryName: optionalText(100),
  signatoryPhone: optionalText(50),
  signatoryEmail: optionalEmail,
});
export type CompanyInput = z.input<typeof companySchema>;

export const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  roles: z
    .array(z.enum(["ADMIN", "MANAGER", "PURCHASER", "WAREHOUSE", "ACCOUNTS"]))
    .min(1, "Pick at least one role")
    .transform((r) => [...new Set(r)]),
  department: optionalText(100),
  // Blank = no limit
  approvalLimit: optionalNumber.refine((v) => v === null || (v >= 0 && v <= 1e12), "Enter a valid amount"),
  active: z.boolean().default(true),
  password: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || v.length >= 8, "Password must be at least 8 characters"),
});
export type UserInput = z.input<typeof userSchema>;

// ── Indents & quotations ────────────────────────────────────────────────────


export const indentLineSchema = z.object({
  itemId: z.coerce.number().int().positive("Select an item"),
  description: z.string().trim().min(1).max(300),
  quantity: pasted(z.coerce.number().positive("Quantity must be more than 0").max(1e9)),
  currentStock: optionalNumber.refine((v) => v === null || v >= 0, "Stock cannot be negative"),
  remarks: optionalText(300),
  /** The unit this line is asked in (the item's own unit when left out). */
  uom: z.string().trim().max(20).optional(),
});

export const indentSchema = z.object({
  department: optionalText(100),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  requiredBy: optionalDate,
  purpose: optionalText(1000),
  items: z.array(indentLineSchema).min(1, "Add at least one item").max(100),
});
export type IndentInput = z.input<typeof indentSchema>;

export const quotationLineSchema = z.object({
  indentItemId: z.coerce.number().int().positive(),
  // Blank rate = vendor did not quote this line
  rate: optionalNumber.refine((v) => v === null || (v >= 0 && v <= 1e10), "Enter a valid rate"),
  discountPct: pasted(z.coerce.number().min(0).max(100)).default(0),
  gstRate: z.coerce.number().min(0).max(40),
  remarks: optionalText(300),
});

export const quotationSchema = z.object({
  vendorId: z.coerce.number().int().positive("Select a vendor"),
  vendorRef: optionalText(100),
  quoteDate: optionalDate,
  validUntil: optionalDate,
  deliveryDays: optionalNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 365), "Days must be 0–365"),
  paymentTerms: optionalText(200),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  earlyDiscountPct: z.coerce.number().min(0).max(100).default(0),
  /** Freight included in the rates, or extra (the amount below, or at actuals); null = not stated. */
  freightTerms: z.enum(["INCLUDED", "EXTRA"]).nullable().default(null),
  otherCharges: pasted(z.coerce.number().min(0).max(1e10)).default(0),
  notes: optionalText(2000),
  items: z
    .array(quotationLineSchema)
    .min(1)
    .refine((lines) => lines.some((l) => l.rate !== null), "Enter a rate for at least one item"),
});
export type QuotationInput = z.input<typeof quotationSchema>;

export const comparisonSchema = z.object({
  selections: z
    .array(
      z.object({
        indentItemId: z.coerce.number().int().positive(),
        quoteItemId: z.coerce.number().int().positive("Choose a vendor for every item"),
        reason: optionalText(500),
      }),
    )
    .min(1),
  justification: optionalText(1000),
});
export type ComparisonInput = z.input<typeof comparisonSchema>;

// ── Vendor bills & payments ─────────────────────────────────────────────────

const amount = (message: string) => pasted(z.coerce.number(message).min(0, message).max(1e12));

export const billSchema = z
  .object({
    invoiceNo: z.string().trim().min(1, "Invoice number is required").max(60),
    invoiceDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the invoice date"),
    taxableAmount: amount("Enter the taxable value"),
    taxAmount: amount("Enter the GST amount"),
    otherCharges: amount("Enter a valid amount").default(0),
    totalAmount: pasted(z.coerce.number("Enter the invoice total").positive("Enter the invoice total").max(1e12)),
    otherDebit: amount("Enter a valid amount").default(0),
    otherDebitReason: optionalText(300),
    remarks: optionalText(1000),
    lines: z
      .array(
        z.object({
          grnItemId: z.coerce.number().int().positive(),
          billedQty: pasted(z.coerce.number("Enter billed qty").min(0).max(1e9)),
          billedRate: pasted(z.coerce.number("Enter billed rate").min(0).max(1e10)),
        }),
      )
      .min(1),
  })
  .refine((v) => v.otherDebit === 0 || !!v.otherDebitReason, { path: ["otherDebitReason"], message: "Say why this amount is deducted" });
export type BillInput = z.input<typeof billSchema>;

export const PAYMENT_MODES = ["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "CASH", "OTHER"] as const;

export const paymentSchema = z.object({
  amount: pasted(z.coerce.number("Enter the amount").positive("Enter the amount").max(1e12)),
  paidOn: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the payment date"),
  mode: z.enum(PAYMENT_MODES),
  reference: optionalText(80),
  note: optionalText(300),
});
export type PaymentInput = z.input<typeof paymentSchema>;

// ── PO amendment ────────────────────────────────────────────────────────────

export const amendmentSchema = z.object({
  reason: z.string().trim().min(5, "Give the reason for the amendment (at least 5 characters)").max(1000),
  header: z.object({
    expectedDeliveryDate: optionalDate,
    paymentTerms: optionalText(200),
    // Missing in amendments requested before billing addresses existed: billing stays unchanged.
    billingAddress: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    deliveryAddress: optionalText(1000),
    terms: optionalText(5000),
  }),
  lines: z
    .array(
      z.object({
        poItemId: z.coerce.number().int().positive(),
        quantity: pasted(z.coerce.number().positive("Quantity must be more than 0").max(1e9)),
        rate: pasted(z.coerce.number().min(0, "Rate cannot be negative").max(1e10)),
        discountPct: pasted(z.coerce.number().min(0).max(100)).default(0),
        gstRate: z.coerce.number().min(0).max(40),
        remove: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type AmendmentInput = z.input<typeof amendmentSchema>;

// ── Goods receipt, quality check, vendor issues ─────────────────────────────

const qty = (message: string) => optionalNumber.refine((v) => v === null || (v >= 0 && v <= 1e9), message);

export const grnSchema = z.object({
  poId: z.coerce.number().int().positive(),
  receivedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the receipt date"),
  invoiceNo: optionalText(60),
  invoiceDate: optionalDate,
  invoiceAmount: qty("Enter a valid invoice amount"),
  challanNo: optionalText(60),
  transporter: optionalText(120),
  biltyNo: optionalText(60),
  biltyDate: optionalDate,
  vehicleNo: optionalText(30),
  freightAmount: qty("Enter a valid freight amount"),
  remarks: optionalText(1000),
  items: z
    .array(
      z.object({
        poItemId: z.coerce.number().int().positive(),
        invoiceQty: qty("Enter a valid invoice quantity"),
        receivedQty: qty("Enter a valid received quantity"),
      }),
    )
    .min(1)
    .refine((lines) => lines.some((l) => (l.receivedQty ?? 0) > 0), "Enter the received quantity for at least one item"),
});
export type GrnInput = z.input<typeof grnSchema>;

const check = z.enum(["PASS", "FAIL"], "Mark pass or fail");

export const qcSchema = z.object({
  remarks: optionalText(1000),
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        qtyCheck: check,
        qualityCheck: check,
        acceptedQty: pasted(z.coerce.number().min(0, "Accepted qty cannot be negative").max(1e9)),
        remarks: optionalText(300),
      }),
    )
    .min(1),
});
export type QcInput = z.input<typeof qcSchema>;

export const ISSUE_TYPE_VALUES = [
  "SHORT_QTY",
  "EXCESS_QTY",
  "QUALITY",
  "DAMAGED",
  "WRONG_ITEM",
  "LATE_DELIVERY",
  "DOCUMENTS",
  "RATE_MISMATCH",
  "OTHER",
] as const;

export const vendorIssueSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  poId: optionalNumber,
  grnId: optionalNumber,
  itemId: optionalNumber,
  type: z.enum(ISSUE_TYPE_VALUES, "Choose the issue type"),
  description: z.string().trim().min(5, "Describe the issue (at least 5 characters)").max(1000),
  qtyAffected: qty("Enter a valid quantity"),
});
export type VendorIssueInput = z.input<typeof vendorIssueSchema>;

export const vendorItemSchema = z.object({
  itemId: z.coerce.number().int().positive("Select an item"),
  vendorItemCode: optionalText(60),
  rate: qty("Enter a valid rate"),
  leadTimeDays: optionalNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 365), "Days must be 0–365"),
  preferred: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalText(500),
});
export type VendorItemInput = z.input<typeof vendorItemSchema>;
