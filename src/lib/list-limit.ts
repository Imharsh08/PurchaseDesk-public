/**
 * Long lists show 50 rows, with "Show more" adding 50 at a time (?limit=). Every row is rendered on
 * the server, so a shorter list is a faster page and less Worker CPU.
 */
export const PAGE_SIZE = 50;
const MAX_ROWS = 1000;

type SearchParams = Record<string, string | string[] | undefined>;

/** Rows to show: ?limit= rounded to whole pages of 50, at least one page, at most 1000. */
export function listLimit(sp: SearchParams) {
  const n = Number(typeof sp.limit === "string" ? sp.limit : NaN);
  if (!Number.isFinite(n) || n <= PAGE_SIZE) return PAGE_SIZE;
  return Math.min(MAX_ROWS, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE);
}

/** The same page with a bigger ?limit=, keeping every other filter. */
export function moreHref(path: string, sp: SearchParams, limit: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "limit") p.set(k, v);
  p.set("limit", String(Math.min(MAX_ROWS, limit + PAGE_SIZE)));
  return `${path}?${p}`;
}
