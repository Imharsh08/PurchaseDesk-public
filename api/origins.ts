/**
 * The web app's addresses: WEB_APP_URL (comma-separated, e.g. "https://purchasedesk.pages.dev"), the
 * Cloudflare Pages preview deployments of a *.pages.dev address (https://<preview>.purchasedesk.pages.dev),
 * and local development.
 */
const LOCAL_WEB = "http://localhost:5173";

const webOrigins = () =>
  (process.env.WEB_APP_URL ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);

function isPagesPreview(origin: string, configured: string) {
  const host = /^https:\/\/([a-z0-9-]+\.pages\.dev)$/.exec(configured)?.[1];
  return !!host && new RegExp(`^https://[a-z0-9-]+\\.${host.replace(/\./g, "\\.")}$`).test(origin);
}

export const isWebOrigin = (origin: string | undefined | null): origin is string => {
  if (!origin) return false;
  const o = origin.toLowerCase();
  return o === LOCAL_WEB || webOrigins().some((w) => o === w || isPagesPreview(o, w));
};

/** This API's own public address, for Google's redirect back (API_PUBLIC_URL, else the request's). */
export function apiBase(requestUrl: string) {
  const configured = process.env.API_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(requestUrl);
  return `https://${url.host}`;
}
