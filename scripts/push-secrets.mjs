/**
 * Uploads the Worker's secrets from .env to Cloudflare in one step, without writing a temp file.
 *   npm run cf:secrets
 * Only the keys below are sent; settings in wrangler.jsonc "vars" must not be secrets too.
 * Blank values are skipped (e.g. SMTP until a sending mailbox is chosen).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SECRET_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ENDPOINT_URL_S3",
  "AWS_REGION",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

const env = {};
for (const line of readFileSync(".env", "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
  env[match[1]] = value;
}

const secrets = Object.fromEntries(SECRET_KEYS.filter((k) => env[k]).map((k) => [k, env[k]]));
const skipped = SECRET_KEYS.filter((k) => !env[k]);
if (!Object.keys(secrets).length) {
  console.error("No secrets found in .env");
  process.exit(1);
}

console.log(`Uploading ${Object.keys(secrets).length} secrets: ${Object.keys(secrets).join(", ")}`);
if (skipped.length) console.log(`Skipping blank: ${skipped.join(", ")}`);

const result = spawnSync("npx", ["wrangler", "secret", "bulk"], {
  input: JSON.stringify(secrets),
  stdio: ["pipe", "inherit", "inherit"],
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
