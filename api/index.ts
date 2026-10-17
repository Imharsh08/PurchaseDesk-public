/**
 * PurchaseDesk API on Neon Functions (README: "Deploy").
 *
 * Hono on Node 24, running next to the database, reusing the app's business code in src/lib.
 * Build with `npm run api:build` (see build.mjs for how shared code is wired in).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isPasswordHash } from "@/lib/password-hash";
import { PERMISSIONS, can, canHardDelete, type Permission } from "@/lib/roles";
import { requireUser, type ApiEnv } from "./auth";
import { requestContext } from "./context";
import { NotFoundSignal, RedirectSignal } from "./stubs/next";
import { db } from "./db";
import { isWebOrigin } from "./origins";
import { actions } from "./routes/actions";
import { ai } from "./routes/ai";
import { auth } from "./routes/auth";
import { files } from "./routes/files";
import { screens } from "./routes/screens";

const startedAt = Date.now();
let served = 0;

const app = new Hono<ApiEnv>();

app.use("*", cors({ origin: (origin) => (isWebOrigin(origin) ? origin : null), allowHeaders: ["Authorization", "Content-Type"], maxAge: 600 }));

// Timing on every response: wall time and CPU of the call, and whether it started a fresh instance.
app.use("*", async (c, next) => {
  const cold = served++ === 0;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  await next();
  const cpu = process.cpuUsage(cpu0);
  c.header("Server-Timing", `total;dur=${(performance.now() - t0).toFixed(1)}`);
  c.header("X-CPU-ms", ((cpu.user + cpu.system) / 1000).toFixed(1));
  c.header("X-Cold-Start", cold ? "1" : "0");
});

app.get("/ping", (c) => c.json({ ok: true, isolateAgeMs: Date.now() - startedAt, served }));
app.route("/auth", auth);

// Everything below needs a signed-in, active user — who is also "the current user" for shared code
// that asks (server actions call authorize(); see api/context.ts).
app.use("*", requireUser);
app.use("*", (c, next) => requestContext.run({ userId: c.get("user").id, request: c.req.raw }, next));

// Shared loaders may call notFound() / redirect() as the Next pages do: answer 404 / { redirect }.
app.onError((error, c) => {
  if (error instanceof NotFoundSignal) return c.json({ error: "Not found." }, 404);
  if (error instanceof RedirectSignal) return c.json({ redirect: error.href });
  console.error(error);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

/**
 * The signed-in user as the app frame needs them (same fields as the Next app's current user), what
 * they may do (the web app shows / hides buttons with it) and whether they may hard-delete records.
 */
app.get("/me", async (c) => {
  const { id, roles } = c.get("user");
  const [user, settings] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, roles: true, department: true, active: true, approvalLimit: true, gmailConnectedAt: true },
    }),
    db.companySettings.findUnique({ where: { id: 1 }, select: { deletePasswordHash: true } }),
  ]);
  const { gmailConnectedAt, ...rest } = user;
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(roles, p));
  const deleteAllowed = canHardDelete(user.email);
  return c.json({
    user: { ...rest, approvalLimit: user.approvalLimit === null ? null : Number(user.approvalLimit), gmailConnected: !!gmailConnectedAt },
    permissions,
    adminDelete: { allowed: deleteAllowed, passwordSet: deleteAllowed && isPasswordHash(settings?.deletePasswordHash) },
  });
});

app.route("/", screens);
app.route("/actions", actions);
app.route("/api", files);
app.route("/ai", ai);

export default app;
