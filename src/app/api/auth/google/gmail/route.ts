import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isGoogleSignInEnabled } from "@/lib/auth-config";
import { getCurrentUser } from "@/lib/dal";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, createOAuthRequest, googleCallbackUrl, safeNextPath } from "@/lib/google-oauth";
import { sessionKey } from "@/lib/session-token";

/** Starts the one-time "Send email as me" consent for the signed-in user (gmail.send scope). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  if (!isGoogleSignInEnabled()) redirect(`${next}${next.includes("?") ? "&" : "?"}gmail=unavailable`);

  const { url, state, nonce, verifier } = createOAuthRequest(googleCallbackUrl(request), { gmail: true, loginHint: user.email });
  const token = await new SignJWT({ state, nonce, verifier, next, mode: "gmail", userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(sessionKey());

  (await cookies()).set(OAUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  redirect(url);
}
