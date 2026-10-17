import "server-only";

/**
 * AES-GCM encryption for secrets stored in the database (e.g. Google refresh tokens), keyed from
 * SESSION_SECRET. Output: base64url(iv) + "." + base64url(ciphertext). Web Crypto, so it runs on
 * Node and Cloudflare Workers alike.
 */
async function key(purpose: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${purpose}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

export async function seal(plain: string, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(purpose), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(data)}`;
}

export async function open(sealed: string, purpose: string) {
  const [iv, data] = sealed.split(".");
  if (!iv || !data) throw new Error("Malformed sealed value");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(Buffer.from(iv, "base64url")) },
    await key(purpose),
    new Uint8Array(Buffer.from(data, "base64url")),
  );
  return new TextDecoder().decode(plain);
}
