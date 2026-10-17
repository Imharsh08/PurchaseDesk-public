/**
 * Runs the app's server actions (src/app/**\/*actions.ts — approve PO, check receipt, save item …)
 * for the web app: POST /actions/<module>/<function>, e.g. /actions/(app)/purchase-orders/actions/approvePO.
 *
 * Only exported functions of "use server" modules can be called (the registry is generated at build
 * time), and each action checks sign-in and permissions itself, exactly as in the Next app.
 *
 * Arguments: JSON { args: [...] }, or multipart when an argument is a FormData (uploads): field
 * "__args" holds the JSON with { "$formData": n } in place of each FormData, and its entries come as
 * "fd<n>:<name>". Dates travel as ISO strings and are turned back into Dates.
 */
import { Hono } from "hono";
import { ACTION_MODULES } from "pd:actions";
import type { ApiEnv } from "../auth";
import { RedirectSignal } from "../stubs/next";

export const actions = new Hono<ApiEnv>();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_key: string, value: unknown) => (typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value);

async function readArgs(request: Request): Promise<unknown[]> {
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const forms = new Map<number, FormData>();
    for (const [key, value] of form.entries()) {
      const m = key.match(/^fd(\d+):(.*)$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!forms.has(n)) forms.set(n, new FormData());
      forms.get(n)!.append(m[2], value);
    }
    const args = JSON.parse(String(form.get("__args") ?? "[]"), reviveDates) as unknown[];
    return args.map((a) => (a && typeof a === "object" && "$formData" in a ? (forms.get(Number((a as { $formData: number }).$formData)) ?? new FormData()) : a));
  }
  const body = JSON.parse((await request.text()) || "{}", reviveDates) as { args?: unknown[] };
  return Array.isArray(body.args) ? body.args : [];
}

actions.post("/*", async (c) => {
  // "/actions/(app)/purchase-orders/actions/approvePO" → module "(app)/purchase-orders/actions", fn "approvePO"
  const rest = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/actions\//, "");
  const slash = rest.lastIndexOf("/");
  const modKey = rest.slice(0, slash);
  const fnName = rest.slice(slash + 1);
  const mod = (ACTION_MODULES as Record<string, Record<string, unknown>>)[modKey];
  const fn = mod && Object.prototype.hasOwnProperty.call(mod, fnName) ? mod[fnName] : undefined;
  if (typeof fn !== "function") return c.json({ error: "Unknown action." }, 404);

  let args: unknown[];
  try {
    args = await readArgs(c.req.raw);
  } catch {
    return c.json({ error: "The request couldn't be read." }, 400);
  }
  try {
    const result = await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
    return c.json({ result: result ?? null });
  } catch (error) {
    if (error instanceof RedirectSignal) return c.json({ redirect: error.href });
    console.error(`Action ${modKey}/${fnName} failed`, error);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }
});
