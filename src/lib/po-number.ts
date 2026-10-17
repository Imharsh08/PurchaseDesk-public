/**
 * PO numbers, in the format set in Settings — a pattern of fixed text and tokens:
 *   {PREFIX}   the prefix from Settings (ABC)
 *   {INITIALS} the sender's initials: first letters of the first and last name (Ganesh Shetty → GS)
 *   {SEQ}      the serial number, 4 digits (0047); {SEQ3} … {SEQ6} for another width
 *   {FY}       financial year, short (26-27); {FYLONG} long (2026-27)
 *   {YYYY} {YY} {MM}  year and month of the PO date
 * e.g. "{PREFIX}/{INITIALS}{SEQ}/{FY}" → ABC/GS0047/26-27. The serial is company-wide; it restarts
 * every financial year when the format has the financial year in it, else it keeps running.
 * The two older styles are kept as named formats. Client-safe (Settings shows a preview).
 */
import { dateFormatter, financialYear } from "@/lib/format";

/** The formats Settings offered before custom ones: kept, numbering unchanged. */
const NAMED: Record<string, string> = {
  YEAR_CONTINUOUS: "{PREFIX}-{YYYY}-{SEQ}",
  FY_RESET: "{PREFIX}/{FYLONG}/{SEQ}",
};

export const PO_FORMAT_EXAMPLES = [
  { pattern: "{PREFIX}/{INITIALS}{SEQ}/{FY}", label: "ABC/GS0047/26-27" },
  { pattern: "{PREFIX}/{FY}/{SEQ}", label: "ABC/26-27/0047" },
  { pattern: "{PREFIX}-{YYYY}-{SEQ}", label: "ABC-2026-0047" },
];

const TOKEN = /\{(PREFIX|INITIALS|SEQ[3-6]?|FY|FYLONG|YYYY|YY|MM)\}/g;

export const patternOf = (style: string) => NAMED[style] ?? style;

/** Restarts each financial year when the number shows it. */
export const resetsYearly = (style: string) => /\{FY(LONG)?\}/.test(patternOf(style));

/** The counter a format draws from: one per financial year, or one running sequence (same keys as before). */
export function poCounterKey(style: string, date = new Date()) {
  return resetsYearly(style) ? `PO:${financialYear(date)}` : "PO:SEQ";
}

/** Why a format can't be used, or null. */
export function patternProblem(style: string) {
  const p = patternOf(style);
  if (!/\{SEQ[3-6]?\}/.test(p)) return "Include {SEQ} (the serial number)";
  const rest = p.replace(TOKEN, "");
  if (/[{}]/.test(rest)) return "Unknown {…} item — use {PREFIX}, {INITIALS}, {SEQ}, {FY}, {FYLONG}, {YYYY}, {YY} or {MM}";
  if (!/^[A-Za-z0-9/\-_.]*$/.test(rest)) return "Only letters, numbers and / - _ . between the items";
  if (p.length > 60) return "Too long";
  return null;
}

/** "Ganesh Shetty" → "GS"; one name → its first two letters ("Administrator" → "AD"). */
export function initialsOf(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (!words.length) return "XX";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function formatPONumber(style: string, prefix: string, seq: number, date = new Date(), sender = "") {
  const fy = financialYear(date);
  const year = dateFormatter("en-CA", { year: "numeric" }).format(date);
  const month = dateFormatter("en-CA", { month: "2-digit" }).format(date);
  return patternOf(style).replace(TOKEN, (_, token: string) => {
    if (token === "PREFIX") return prefix;
    if (token === "INITIALS") return initialsOf(sender);
    if (token.startsWith("SEQ")) return String(seq).padStart(Number(token.slice(3)) || 4, "0");
    if (token === "FY") return fy.slice(2);
    if (token === "FYLONG") return fy;
    if (token === "YYYY") return year;
    if (token === "YY") return year.slice(2);
    return month;
  });
}
