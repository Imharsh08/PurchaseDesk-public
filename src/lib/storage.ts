import "server-only";

import { AwsClient } from "aws4fetch";

/**
 * File storage for generated PO PDFs and uploaded logos.
 * - Neon Object Storage (S3 API) when the AWS_* variables from `neon link` are set.
 *   Required on Cloudflare Workers, which have no persistent disk.
 * - Local disk (STORAGE_DIR) otherwise, for offline development.
 */

function s3() {
  // STORAGE_DRIVER=local forces local disk even when AWS_* are set (e.g. testing against a Neon branch).
  if (process.env.STORAGE_DRIVER === "local") return null;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: process.env.AWS_REGION || "auto",
  });
  const bucket = process.env.STORAGE_BUCKET || "purchasedocs";
  // Neon requires path-style addressing: {endpoint}/{bucket}/{key}
  const urlFor = (key: string) =>
    `${endpoint.replace(/\/+$/, "")}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return { client, urlFor };
}

function normaliseKey(relativePath: string) {
  const key = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!key || key.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid storage path: ${relativePath}`);
  }
  return key;
}

async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveFile(relativePath: string, data: Uint8Array, contentType = "application/octet-stream") {
  const key = normaliseKey(relativePath);
  const remote = s3();
  if (remote) {
    const res = await remote.client.fetch(remote.urlFor(key), {
      method: "PUT",
      body: data.slice(),
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`Upload failed for ${key}: HTTP ${res.status} ${await res.text()}`);
  } else {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const full = localPath(path, key);
    await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ full, data);
  }
  return { storagePath: key, size: data.byteLength, sha256: await sha256Hex(data) };
}

export async function readStoredFile(relativePath: string): Promise<Uint8Array> {
  const key = normaliseKey(relativePath);
  const remote = s3();
  if (remote) {
    const res = await remote.client.fetch(remote.urlFor(key));
    if (!res.ok) throw new Error(`Download failed for ${key}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return new Uint8Array(await readFile(/*turbopackIgnore: true*/ localPath(path, key)));
}

/**
 * A stored file as a stream, for passing straight to a Response: the Worker neither waits for the
 * whole file nor copies it. Null when missing or unreadable.
 */
export async function openStoredFile(relativePath: string | null | undefined): Promise<{ body: BodyInit; size: string | null } | null> {
  if (!relativePath) return null;
  try {
    const key = normaliseKey(relativePath);
    const remote = s3();
    if (remote) {
      const res = await remote.client.fetch(remote.urlFor(key));
      if (!res.ok || !res.body) return null;
      return { body: res.body, size: res.headers.get("content-length") };
    }
    const file = await readStoredFile(key);
    return { body: file.slice(), size: String(file.byteLength) };
  } catch {
    return null;
  }
}

export async function tryReadStoredFile(relativePath: string | null | undefined) {
  if (!relativePath) return null;
  try {
    return await readStoredFile(relativePath);
  } catch {
    return null;
  }
}

function localPath(path: typeof import("node:path"), key: string) {
  const base = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || "./storage");
  const full = path.resolve(/*turbopackIgnore: true*/ base, key);
  if (!full.startsWith(base + path.sep)) throw new Error(`Refusing to access path outside storage: ${key}`);
  return full;
}
