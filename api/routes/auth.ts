/**
 * Sign-in for the web app — the same rules as the Next app (src/app/login, src/app/api/auth):
 * Google for @ALLOWED_EMAIL_DOMAIN accounts added in Users; password sign-in only when Google is
 * not configured. A successful sign-in hands the web app a session token (12 hours).
 *
 * Also the one-time "Send email as me" Gmail consent: the web app asks for a short ticket (with its
 * session token), then opens /auth/google/gmail?ticket= as a normal page, so the OAuth cookie is
 * first-party; the shared callback stores the Gmail refresh token and returns to the web app.
 */
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { allowedDomain, isAllowedEmail, isGoogleSignInEnabled } from "@/lib/auth-config";
import { GMAIL_SCOPE, saveGmailToken } from "@/lib/gmail";
import { checkGoogleClaims, createOAuthRequest, exchangeCode, exchangeCodeForIdToken, safeNextPath, type GoogleClaims } from "@/lib/google-oauth";
import { sessionKey, signSessionToken } from "@/lib/session-token";
import { requireUser, type ApiEnv } from "../auth";
import { db } from "../db";
import { apiBase, isWebOrigin } from "../origins";

const OAUTH_COOKIE = "pd_google_oauth";
const OAUTH_PATH = "/auth/google";

type SavedRequest = { state: string; nonce: string; verifier: string; next: string; web: string; gmailUserId?: number };
type GmailTicket = { gmailTicket: true; userId: number; next: string; web: string };

/**
 * OAuth cookies and Gmail tickets are signed with a key of their own (derived from SESSION_SECRET):
 * signed with the session key, a token naming a user would also pass as that user's session.
 */
const oauthKey = () => new Uint8Array([...sessionKey(), ...new TextEncoder().encode("|oauth")]);
async function verifyOAuth<T>(raw: string | undefined) {
  try {
    return raw ? (await jwtVerify<T>(raw, oauthKey(), { algorithms: ["HS256"] })).payload : null;
  } catch {
    return null;
  }
}
const signOAuth = (payload: SavedRequest | GmailTicket, expires: string) =>
  new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime(expires).sign(oauthKey());
const callbackUrl = (requestUrl: string) => `${apiBase(requestUrl)}${OAUTH_PATH}/callback`;
const withGmailFlag = (path: string, flag: string) => `${path}${path.includes("?") ? "&" : "?"}gmail=${flag}`;

export const auth = new Hono<ApiEnv>();

/** What the login page should offer. */
auth.get("/config", (c) => c.json({ google: isGoogleSignInEnabled(), domain: allowedDomain() || null }));

const passwordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("timing-equaliser", 10));

auth.post("/password", async (c) => {
  const parsed = passwordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const { email, password } = parsed.data;
  // Once Google sign-in is configured it is the only way in.
  if (isGoogleSignInEnabled()) return c.json({ error: "Please use “Sign in with Google”." }, 400);
  if (!isAllowedEmail(email)) return c.json({ error: `Only @${allowedDomain()} accounts can sign in.` }, 400);

  const user = await db.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !user.passwordHash || !valid) return c.json({ error: "Incorrect email or password." }, 401);
  if (!user.active) return c.json({ error: "Your account is disabled. Contact your administrator." }, 403);

  const session = await signSessionToken(user.id);
  return c.json(session);
});

/** Starts "Sign in with Google". ?return= is the web app's address (checked), ?next= the page to open after. */
auth.get("/google", async (c) => {
  const web = c.req.query("return");
  if (!isWebOrigin(web)) return c.text("Unknown app address.", 400);
  if (!isGoogleSignInEnabled()) return c.redirect(`${web}/login?error=google_disabled`);

  const next = safeNextPath(c.req.query("next"));
  const { url, state, nonce, verifier } = createOAuthRequest(callbackUrl(c.req.url));
  setCookie(c, OAUTH_COOKIE, await signOAuth({ state, nonce, verifier, next, web }, "10m"), { httpOnly: true, secure: true, sameSite: "Lax", path: OAUTH_PATH, maxAge: 600 });
  return c.redirect(url);
});

/** "Send email as me", step 1 (signed in): where to send the browser. The ticket lasts a minute. */
auth.post("/gmail/ticket", requireUser, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { next?: unknown; return?: unknown };
  const web = typeof body.return === "string" ? body.return : undefined;
  if (!isWebOrigin(web)) return c.json({ error: "Unknown app address." }, 400);
  const next = safeNextPath(body.next);
  if (!isGoogleSignInEnabled()) return c.json({ url: `${web}${withGmailFlag(next, "unavailable")}` });
  const ticket = await signOAuth({ gmailTicket: true, userId: c.get("user").id, next, web }, "1m");
  return c.json({ url: `${apiBase(c.req.url)}${OAUTH_PATH}/gmail?ticket=${encodeURIComponent(ticket)}` });
});

/** Step 2, opened as a page: Google's consent for the gmail.send scope, for the ticket's user. */
auth.get("/google/gmail", async (c) => {
  const ticket = await verifyOAuth<GmailTicket>(c.req.query("ticket"));
  if (!ticket?.gmailTicket || !isWebOrigin(ticket.web)) return c.text("This link has expired. Go back to PurchaseDesk and try again.", 400);
  const user = await db.user.findUnique({ where: { id: ticket.userId }, select: { email: true, active: true } });
  if (!user?.active) return c.redirect(`${ticket.web}/login`);

  const { url, state, nonce, verifier } = createOAuthRequest(callbackUrl(c.req.url), { gmail: true, loginHint: user.email });
  const saved = await signOAuth({ state, nonce, verifier, next: ticket.next, web: ticket.web, gmailUserId: ticket.userId }, "10m");
  setCookie(c, OAUTH_COOKIE, saved, { httpOnly: true, secure: true, sameSite: "Lax", path: OAUTH_PATH, maxAge: 600 });
  return c.redirect(url);
});

/** Step 3 (from the callback): keep the refresh token, if Google gave one for the user's own mailbox. */
async function finishGmailConsent(requestUrl: string, saved: SavedRequest, userId: number, code: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, active: true } });
  if (!user?.active) return "expired";
  let result: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    result = await exchangeCode(code, saved.verifier, callbackUrl(requestUrl));
  } catch (error) {
    console.error("Gmail consent failed", error);
    return "failed";
  }
  if (result.claims.nonce !== saved.nonce) return "expired";
  // The mailbox must be the user's own account.
  if (result.claims.email?.toLowerCase() !== user.email.toLowerCase()) return "wrong_account";
  if (!result.scope.split(" ").includes(GMAIL_SCOPE)) return "denied";
  if (!result.refreshToken) return "no_token";
  await saveGmailToken(user.id, result.refreshToken);
  await audit({ userId: user.id, action: "gmail", entityType: "user", entityId: user.id, description: "Connected Gmail to send email as themselves" });
  return "connected";
}

/** Google sends the user back here; we send them on to the web app (with a session token after sign-in). */
auth.get(`/google/callback`, async (c) => {
  const saved = await verifyOAuth<SavedRequest>(getCookie(c, OAUTH_COOKIE));
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_PATH });
  // Without a valid saved request we don't know (or trust) where to send the user.
  if (!saved || !isWebOrigin(saved.web)) return c.text("This sign-in link has expired. Open PurchaseDesk and sign in again.", 400);

  if (saved.gmailUserId !== undefined) {
    const back = (flag: string) => c.redirect(`${saved.web}${withGmailFlag(safeNextPath(saved.next), flag)}`);
    if (c.req.query("error")) return back("denied");
    const code = c.req.query("code");
    if (!code || c.req.query("state") !== saved.state) return back("expired");
    return back(await finishGmailConsent(c.req.url, saved, saved.gmailUserId, code));
  }

  const fail = (error: string, extra = "") => c.redirect(`${saved.web}/login?error=${error}${extra}`);
  if (c.req.query("error")) return fail("google_cancelled");
  const code = c.req.query("code");
  if (!code || c.req.query("state") !== saved.state) return fail("expired");

  let claims: GoogleClaims | null = null;
  try {
    claims = await exchangeCodeForIdToken(code, saved.verifier, callbackUrl(c.req.url));
  } catch (error) {
    console.error("Google sign-in failed", error);
  }
  if (!claims) return fail("google_failed");
  const check = checkGoogleClaims(claims, saved.nonce);
  if (!check.ok) return fail(check.error);

  const user = await db.user.findUnique({ where: { email: check.email } });
  if (!user) return fail("not_registered", `&email=${encodeURIComponent(check.email)}`);
  if (!user.active) return fail("disabled");

  const { token } = await signSessionToken(user.id);
  await audit({ userId: user.id, action: "login", entityType: "user", entityId: user.id, description: "Signed in with Google (new app)" });
  // The token goes in the fragment: browsers never send it to a server or keep it in logs.
  return c.redirect(`${saved.web}/auth/callback#token=${encodeURIComponent(token)}&next=${encodeURIComponent(saved.next)}`);
});
