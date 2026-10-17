import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { GMAIL_SCOPE, saveGmailToken } from "@/lib/gmail";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  checkGoogleClaims,
  exchangeCode,
  exchangeCodeForIdToken,
  googleCallbackUrl,
  safeNextPath,
  type GoogleClaims,
} from "@/lib/google-oauth";
import { createSession } from "@/lib/session";
import { sessionKey } from "@/lib/session-token";

type SavedRequest = { state: string; nonce: string; verifier: string; next: string; mode?: "gmail"; userId?: number };

const withFlag = (path: string, flag: string) => `${path}${path.includes("?") ? "&" : "?"}gmail=${flag}`;

/** "Send email as me": store the refresh token for the signed-in user. */
async function finishGmailConsent(request: Request, saved: SavedRequest, code: string) {
  const next = safeNextPath(saved.next);
  const user = await getCurrentUser();
  if (!user || user.id !== saved.userId) return withFlag(next, "expired");
  let result: Awaited<ReturnType<typeof exchangeCode>> | null = null;
  try {
    result = await exchangeCode(code, saved.verifier, googleCallbackUrl(request));
  } catch (error) {
    console.error("Gmail consent failed", error);
    return withFlag(next, "failed");
  }
  if (result.claims.nonce !== saved.nonce) return withFlag(next, "expired");
  // The mailbox must be the user's own account.
  if (result.claims.email?.toLowerCase() !== user.email.toLowerCase()) return withFlag(next, "wrong_account");
  if (!result.scope.split(" ").includes(GMAIL_SCOPE)) return withFlag(next, "denied");
  if (!result.refreshToken) return withFlag(next, "no_token");
  await saveGmailToken(user.id, result.refreshToken);
  await audit({ userId: user.id, action: "gmail", entityType: "user", entityId: user.id, description: "Connected Gmail to send email as themselves" });
  return withFlag(next, "connected");
}

// Note: redirect() throws, so it is never called inside a try block here.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_COOKIE)?.value;
  cookieStore.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });

  let saved: SavedRequest | null = null;
  try {
    saved = raw ? (await jwtVerify<SavedRequest>(raw, sessionKey(), { algorithms: ["HS256"] })).payload : null;
  } catch {
    saved = null;
  }
  if (params.get("error") && saved?.mode !== "gmail") redirect("/login?error=google_cancelled");
  const code = params.get("code");
  if (saved?.mode === "gmail") {
    if (params.get("error")) redirect(withFlag(safeNextPath(saved.next), "denied"));
    if (!code || params.get("state") !== saved.state) redirect(withFlag(safeNextPath(saved.next), "expired"));
    redirect(await finishGmailConsent(request, saved, code));
  }
  if (!saved || !code || params.get("state") !== saved.state) redirect("/login?error=expired");

  let claims: GoogleClaims | null = null;
  try {
    claims = await exchangeCodeForIdToken(code, saved.verifier, googleCallbackUrl(request));
  } catch (error) {
    console.error("Google sign-in failed", error);
  }
  if (!claims) redirect("/login?error=google_failed");

  const check = checkGoogleClaims(claims, saved.nonce);
  if (!check.ok) redirect(`/login?error=${check.error}`);

  const user = await db.user.findUnique({ where: { email: check.email } });
  if (!user) redirect(`/login?error=not_registered&email=${encodeURIComponent(check.email)}`);
  if (!user.active) redirect("/login?error=disabled");

  await createSession(user.id);
  await audit({ userId: user.id, action: "login", entityType: "user", entityId: user.id, description: "Signed in with Google" });
  redirect(safeNextPath(saved.next));
}
