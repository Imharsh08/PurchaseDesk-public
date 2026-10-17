export const TIME_ZONE = "Asia/Kolkata";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A date formatter in Indian time, built once per locale + options and reused. Building one with a
 * time zone is costly (ICU data); doing it for every date in a 200-row table was ~15% of a page's
 * server CPU.
 */
export function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateFormatters.get(key);
  if (!f) dateFormatters.set(key, (f = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, ...options })));
  return f;
}

type Numeric = number | string | { toString(): string } | null | undefined;

/**
 * A number as typed or pasted from a bill or sheet, without its commas, ₹ / Rs and spaces:
 * "66,750.00" → "66750.00", "₹ 6,67,500" → "667500", "Rs. 320/-" → "320". Text that still isn't a
 * number comes back as it was (trimmed), so it is reported as invalid rather than read as something else.
 */
export function cleanNumber(text: string) {
  const t = text
    .trim()
    .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
    .replace(/\/-$/, "")
    .replace(/[\s,₹]/g, "");
  return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(t) ? t : text.trim();
}

/** A typed number (commas etc. allowed, see cleanNumber); null when blank, NaN when not a number. */
export const parseNumber = (text: string) => (text.trim() === "" ? null : Number(cleanNumber(text)));

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(typeof value === "string" ? cleanNumber(value) : value.toString());
  return Number.isFinite(n) ? n : 0;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 125000 -> "1,25,000.00" (Indian digit grouping). */
export function formatAmount(value: Numeric) {
  return inrFormatter.format(toNumber(value));
}

/** 125000 -> "₹1,25,000.00" */
export function formatINR(value: Numeric) {
  const n = toNumber(value);
  return `${n < 0 ? "-" : ""}₹${inrFormatter.format(Math.abs(n))}`;
}

/** Compact form for dashboards: 1.25 L, 3.4 Cr */
export function formatINRCompact(value: Numeric) {
  const n = toNumber(value);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return formatINR(n);
}

const qtyFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function formatQty(value: Numeric) {
  return qtyFormatter.format(toNumber(value));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateFormatter("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateFormatter("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** yyyy-mm-dd in IST, for <input type="date"> values. */
export function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return dateFormatter("en-CA", {}).format(new Date(value));
}

/** Indian financial year (April–March) for a date, in IST: "2026-27". */
export function financialYear(date = new Date()) {
  const parts = dateFormatter("en-CA", { year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred ? `${ONES[hundred]} Hundred` : "", rest ? twoDigits(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Indian numbering system: crore / lakh / thousand. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  n %= 1e3;
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

/** 125450.5 -> "Rupees One Lakh Twenty Five Thousand Four Hundred Fifty and Fifty Paise Only" */
export function amountInWords(value: Numeric) {
  const n = Math.abs(toNumber(value));
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let words = `Rupees ${integerToWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

/** "Good morning / afternoon / evening" by the time of day in IST. */
export function greeting(now = new Date()) {
  const hour = Number(dateFormatter("en-IN", { hour: "numeric", hour12: false }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}