/**
 * Reading values out of invoice text: amounts (Indian or Western grouping), quantities, dates,
 * GSTINs and vehicle numbers. OCR confuses letters and digits (O/0, S/5, B/8, I/1), so each reader
 * repairs them where the format says which one it must be.
 */

const LETTER_TO_DIGIT: Record<string, string> = { O: "0", o: "0", D: "0", Q: "0", U: "0", I: "1", l: "1", i: "1", "|": "1", "!": "1", L: "1", Z: "2", z: "2", S: "5", s: "5", G: "6", b: "6", T: "7", B: "8", g: "9", q: "9" };
const DIGIT_TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B", "4": "A", "7": "T" };

/**
 * A money amount or quantity: "8,00,000.00", "2,500.000", "₹ 1,234", "1.67.310.00" (OCR read the
 * commas as dots), "(250.00" (a tick mark before it). Null when it isn't one.
 */
export function parseNumber(raw: string): number | null {
  let t = raw.trim().replace(/^(rs\.?|inr|₹)\s*/i, "");
  // Brackets, bars and tick marks around a number on scans.
  t = t.replace(/^[^\dA-Za-z]+/, "").replace(/[^\dA-Za-z]+$/, "");
  if (!t) return null;
  const digits = (t.match(/\d/g) ?? []).length;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  // Mostly digits: letters inside are misread digits. Otherwise it's a word, not a number.
  if (digits === 0 || letters > Math.max(1, digits / 3)) return null;
  t = t.replace(/[A-Za-z|!]/g, (c) => LETTER_TO_DIGIT[c] ?? c);
  if (!/^[\d,.]+$/.test(t)) return null;
  // Separators: the last "." (or "," before 1–2 digits at the end, as in 1.234,56 — not used in
  // India, so only "." counts) is the decimal point; every other "," or "." groups thousands.
  const lastDot = t.lastIndexOf(".");
  let intPart = t;
  let frac = "";
  if (lastDot >= 0 && t.length - lastDot - 1 <= 3 && t.length - lastDot - 1 >= 1) {
    intPart = t.slice(0, lastDot);
    frac = t.slice(lastDot + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart) || (frac && !/^\d+$/.test(frac))) return null;
  const n = Number(frac ? `${intPart}.${frac}` : intPart);
  return Number.isFinite(n) ? n : null;
}

/** Numbers in a piece of text, left to right (each whitespace-separated token tried on its own). */
export function numbersIn(text: string) {
  return text
    .split(/\s+/)
    .map(parseNumber)
    .filter((n): n is number => n !== null);
}

/** Has at most `places` decimals (within rounding), e.g. a rate in paise or a quantity in grams. */
export function isRound(n: number, places: number) {
  const x = n * 10 ** places;
  // Only floating-point error is forgiven (0.1 + 0.2), never a real fraction of a paisa.
  return Math.abs(x - Math.round(x)) <= Math.max(1e-6, Math.abs(x) * 1e-12);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A month name, allowing one misread letter ("0ct", "Dct" → Oct); null when unclear. */
function monthOf(word: string) {
  const w = word.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").slice(0, 3);
  if (w.length < 3) return null;
  const exact = MONTHS.indexOf(w);
  if (exact >= 0) return exact + 1;
  const close = MONTHS.map((m, i) => ({ i, d: [...m].filter((c, k) => c !== w[k]).length })).filter((m) => m.d <= 1);
  return close.length === 1 ? close[0].i + 1 : null;
}

function ymd(day: number, month: number, year: number) {
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first date in the text, day first as on Indian invoices: 13-Oct-26, 13/10/2026, 13.10.26, 13 October 2026. "YYYY-MM-DD" or null. */
export function parseDate(text: string): string | null {
  const fixed = text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0");
  const named = /(\d{1,2})\s*[-./ ,]?\s*([A-Za-z0-9]{3,9})\.?\s*[-./ ,]\s*'?(\d{4}|\d{2})(?!\d)/g;
  const numeric = /(?<!\d)(\d{1,2})\s?[-./]\s?(\d{1,2})\s?[-./]\s?(\d{4}|\d{2})(?!\d)/g;
  const found: { at: number; date: string }[] = [];
  for (const m of fixed.matchAll(numeric)) {
    const d = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) found.push({ at: m.index ?? 0, date: d });
  }
  for (const m of fixed.matchAll(named)) {
    if (/^\d+$/.test(m[2])) continue;
    const month = monthOf(m[2]);
    const d = month ? ymd(Number(m[1]), month, Number(m[3])) : null;
    if (d) found.push({ at: m.index ?? 0, date: d });
  }
  found.sort((a, b) => a.at - b.at);
  return found[0]?.date ?? null;
}

// ── GSTIN: 2-digit state, PAN (5 letters, 4 digits, letter), entity no., "Z", check character. ──
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGIT_AT = new Set([0, 1, 7, 8, 9, 10]);
const LETTER_AT = new Set([2, 3, 4, 5, 6, 11]);

/** The GSTIN check character (mod-36 Luhn), so a misread GSTIN is caught instead of trusted. */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = ALNUM.indexOf(first14[i]) * ((i % 2) + 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return ALNUM[(36 - (sum % 36)) % 36];
}

export const isValidGstin = (g: string) => GSTIN_RE.test(g) && gstinCheckChar(g) === g[14];

function repairGstin(candidate: string) {
  const chars = [...candidate.toUpperCase()].map((c, i) => {
    if (DIGIT_AT.has(i)) return LETTER_TO_DIGIT[c] ?? c;
    if (LETTER_AT.has(i)) return DIGIT_TO_LETTER[c] ?? c;
    if (i === 13) return c === "2" ? "Z" : c;
    return c;
  });
  return chars.join("");
}

/** Every valid GSTIN in the text (spaces and OCR slips allowed; the check character must agree). */
export function findGstins(text: string) {
  const squashed = text.toUpperCase().replace(/[^0-9A-Z|!]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 15 <= squashed.length; i++) {
    const g = repairGstin(squashed.slice(i, i + 15));
    if (isValidGstin(g)) out.add(g);
  }
  return [...out];
}

/** An Indian vehicle registration: HR38AG9767, UP 15 AB 1234, DL1C1234. Null when there isn't one. */
export function findVehicleNo(text: string) {
  const squashed = text.toUpperCase().replace(/[^0-9A-Z]/g, " ");
  for (const m of squashed.matchAll(/\b([A-Z0-9]{2})\s?([A-Z0-9]{1,2})\s?([A-Z0-9]{0,3})\s?([A-Z0-9]{4})\b/g)) {
    const state = m[1].replace(/[0-9]/g, (c) => DIGIT_TO_LETTER[c] ?? c);
    const district = m[2].replace(/[A-Za-z]/g, (c) => LETTER_TO_DIGIT[c] ?? c);
    const series = m[3].replace(/[0-9]/g, (c) => DIGIT_TO_LETTER[c] ?? c);
    const number = m[4].replace(/[A-Za-z]/g, (c) => LETTER_TO_DIGIT[c] ?? c);
    const v = `${state}${district}${series}${number}`;
    if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(v) && STATE_CODES.has(state)) return v;
  }
  return null;
}

const STATE_CODES = new Set(
  "AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS UK UP WB BH".split(" "),
);
