import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isGoogleSignInEnabled } from "@/lib/auth-config";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  createOAuthRequest,
  googleCallbackUrl,
  safeNextPath,
} from "@/lib/google-oauth";
import { sessionKey } from "@/lib/session-token";

/** Starts "Sign in with Google": stores state/nonce/PKCE verifier in a short-lived signed cookie. */
export async function GET(request: Request) {
  if (!isGoogleSignInEnabled()) redirect("/login?error=google_disabled");

  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const { url, state, nonce, verifier } = createOAuthRequest(googleCallbackUrl(request));

  const token = await new SignJWT({ state, nonce, verifier, next })
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
