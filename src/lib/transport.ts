/**
 * Inward transport (Settings → Transport): which transporters bring material from each vendor city to
 * our shipping address, e.g. Mumbai → Vijay Lakshmi Transport. A vendor's own preferred transporter
 * comes first; names typed at earlier dispatches from the same city are suggested too. No database,
 * so the server and both apps share it.
 */
export type TransportRoute = { city: string; name: string };
export type TransportSettings = { destination: string; routes: TransportRoute[] };
/** Names typed at dispatch, by vendor place (see `placeKey`), most recent first. */
export type UsedTransport = Record<string, string[]>;
/** What the screens need to suggest a transporter. */
export type TransportOptions = { settings: TransportSettings; used: UsedTransport };

export const MAX_ROUTES = 300;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Names without repeats (ignoring case), first spelling kept. */
export function uniqueNames(names: (string | null | undefined)[]) {
  const out: string[] = [];
  for (const n of names) {
    const v = n?.trim();
    if (v && !out.some((o) => same(o, v))) out.push(v);
  }
  return out;
}

/** The stored settings (JSON, maybe partial) with blanks and repeats dropped. */
export function resolveTransport(raw: unknown): TransportSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const routes: TransportRoute[] = [];
  for (const r of Array.isArray(o.routes) ? o.routes : []) {
    const route = { city: clean((r as TransportRoute)?.city, 60), name: clean((r as TransportRoute)?.name, 100) };
    if (route.city && route.name && !routes.some((x) => same(x.city, route.city) && same(x.name, route.name))) routes.push(route);
  }
  return { destination: clean(o.destination, 100), routes: routes.slice(0, MAX_ROUTES) };
}

/**
 * One route per line, "City, Transporter" (or tab-separated, as pasted from a sheet). A "City,Transport"
 * header line is skipped. Lines without both parts are reported.
 */
export function parseRoutes(text: string): { routes: TransportRoute[]; problems: string[] } {
  const routes: TransportRoute[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || /^\s*city\s*[,\t]\s*transport(er)?s?\s*$/i.test(line)) return;
    const at = line.search(/[,\t]/);
    const city = clean(at < 0 ? line : line.slice(0, at), 60);
    const name = clean(at < 0 ? "" : line.slice(at + 1), 100);
    if (!city || !name) problems.push(`Line ${i + 1}: “${line.trim()}” needs a city, a comma and the transporter.`);
    else if (!routes.some((r) => same(r.city, city) && same(r.name, name))) routes.push({ city, name });
  });
  if (routes.length > MAX_ROUTES) problems.push(`Up to ${MAX_ROUTES} lines.`);
  return { routes, problems };
}

export const routesText = (routes: TransportRoute[]) => routes.map((r) => `${r.city}, ${r.name}`).join("\n");

/** Cities in the list, each once, in list order. */
export const routeCities = (routes: TransportRoute[]) => uniqueNames(routes.map((r) => r.city));

type VendorPlace = { city: string | null; address?: string | null };

/**
 * The list city a vendor is in: from its city ("New Delhi" is Delhi), or, only for vendors saved
 * without a city, a list city named in its address (an Ahmedabad vendor on "Delhi Darwaza" isn't in
 * Delhi). Longer names win ("Navi Mumbai" before "Mumbai").
 */
export function routeCity(routes: TransportRoute[], vendor: VendorPlace) {
  const text = vendor.city?.trim() || vendor.address?.trim();
  if (!text) return null;
  const hay = norm(text);
  return routeCities(routes).sort((a, b) => b.length - a.length).find((c) => hay.includes(norm(c))) ?? null;
}

/** Key for "names used from this place" (lower case): the list city, else the vendor's own city. */
export function placeKey(routes: TransportRoute[], vendor: VendorPlace) {
  return (routeCity(routes, vendor) ?? vendor.city?.trim() ?? "").toLowerCase() || null;
}

/** How the ordered items always come (the first line with one), e.g. an adhesive by courier. */
export const itemTransport = (items: ({ preferredTransport?: string | null } | null | undefined)[]) =>
  items.map((i) => i?.preferredTransport?.trim()).find(Boolean) ?? null;

/**
 * Transporters to suggest for a vendor: how the item always comes (if it does), the vendor's preferred
 * one, the list for its city, then names typed at earlier dispatches from there. `recommended` is
 * what goes on a new PO.
 */
export function transportChoices(
  { settings, used }: TransportOptions,
  vendor: VendorPlace & { preferredTransport?: string | null },
  forItem: string | null = null,
) {
  const city = routeCity(settings.routes, vendor);
  const listed = city ? settings.routes.filter((r) => same(r.city, city)).map((r) => r.name) : [];
  const key = placeKey(settings.routes, vendor);
  const options = uniqueNames([forItem, vendor.preferredTransport, ...listed, ...(key ? (used[key] ?? []) : [])]);
  return { city, recommended: forItem?.trim() || vendor.preferredTransport?.trim() || listed[0] || null, options };
}

/** "Mumbai → MIDC Chakan, Pune", for hints. */
export const routeLabel = (settings: TransportSettings, city: string | null) =>
  city ? `${city}${settings.destination ? ` → ${settings.destination}` : ""}` : null;
