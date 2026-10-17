import "server-only";

/**
 * Hashing for the admin delete password. The Worker runs on a plan that stops a request after about
 * 10 ms of CPU, so slow password hashes (bcrypt: ~400 ms, PBKDF2: ~90 ms) get requests killed with a
 * 503. Instead: one HMAC-SHA256, keyed with SESSION_SECRET and salted per password. That's microseconds;
 * the database alone can't be used to guess it (the key isn't stored there), and guessing through
 * the app is locked after 5 wrong tries. Stored as `hmac$<salt>$<mac>` (base64).
 */

const PREFIX = "hmac$";

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return (keyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`admin-delete:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  ));
}

const message = (salt: Uint8Array, password: string) => {
  const pw = new TextEncoder().encode(password);
  const out = new Uint8Array(salt.length + pw.length);
  out.set(salt);
  out.set(pw, salt.length);
  return out;
};

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), message(salt, password)));
  return `${PREFIX}${toB64(salt)}$${toB64(mac)}`;
}

/** Whether a stored value is a hash this module can check (older bcrypt hashes count as "not set"). */
export function isPasswordHash(stored: string | null | undefined): stored is string {
  return !!stored?.startsWith(PREFIX);
}

export async function verifyPassword(password: string, stored: string) {
  const [, salt, mac] = stored.split("$");
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", await key(), fromB64(mac), message(fromB64(salt), password));
}
