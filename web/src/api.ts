/**
 * Calls to the PurchaseDesk API (Neon Function). The address comes from VITE_API_URL
 * (web/.env.development.local for local work; the Pages project's settings in production).
 * The session token travels as a Bearer token; a 401 means it ended, so the user signs in again.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

const TOKEN_KEY = "pd_token";

/** Expiry of a session token (seconds since 1970), read from its payload; 0 if unreadable. */
function expiryOf(token: string) {
  try {
    return Number(JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp) || 0;
  } catch {
    return 0;
  }
}

/** The stored session token, or null when there is none or it has expired. */
export function getToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (expiryOf(token) * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked (private mode): the session lasts until the page is closed.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Only same-site relative paths, so a link can't send the user somewhere else after sign-in. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Calls the API. With { raw: true } the response body comes back as text (see data.ts for why). */
export async function api<T>(path: string, init: RequestInit = {}, opts: { raw?: boolean } = {}): Promise<T> {
  if (!API_URL) throw new ApiError("The API address (VITE_API_URL) is not set.", 0);
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.status === 401 && token) {
    // The session ended (expired, or the account was disabled): sign in again, then come back here.
    clearToken();
    window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? `The server answered ${res.status}.`, res.status);
  return (opts.raw ? text : body) as T;
}
