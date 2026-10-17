/**
 * Who brings a PO's material: the transporter recorded at dispatch (with the bilty), else the one
 * named in the PO's terms ("Transport: Vijay Lakshmi Transport", also "2. Transporter - VRL").
 * No database, so the list screen in both apps can use it.
 */
// Spaces and tabs only ([ \t], not \s): a blank "Transport:" line mustn't swallow the next line.
const TERMS_LINE = /^([ \t]*(?:\d+[ \t]*[.)][ \t]*)?transport(?:er)?(?:[ \t]+name)?[ \t]*[:\-–][ \t]*)(.*?)[ \t]*$/im;

/** The transporter named in a PO's terms. */
export const termsTransporter = (terms: string | null) => terms?.match(TERMS_LINE)?.[2] || null;

export function poTransporter(po: { dispatchTransporter: string | null; terms: string | null }) {
  return po.dispatchTransporter?.trim() || termsTransporter(po.terms);
}

/**
 * The terms with this transporter on their "Transport:" line (keeping its place and numbering), added
 * as the last line when there is none. An empty name blanks the line but keeps it, so clearing the
 * box to type another name doesn't move the line to the end.
 */
export function withTransport(terms: string, name: string) {
  const value = name.replace(/\s+/g, " ").trim();
  if (TERMS_LINE.test(terms)) {
    return terms.replace(TERMS_LINE, (_, prefix: string) => (value ? `${prefix}${/\s$/.test(prefix) ? "" : " "}${value}` : prefix.trimEnd()));
  }
  if (!value) return terms;
  return `${terms.replace(/\s+$/, "")}${terms.trim() ? "\n" : ""}Transport: ${value}`;
}
