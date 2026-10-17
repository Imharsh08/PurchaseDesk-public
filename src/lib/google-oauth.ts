import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { allowedDomain, isAllowedEmail } from "@/lib/auth-config";

// Google OpenID Connect, authorization code flow with PKCE, state and nonce.
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleClaims = JWTPayload & {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  nonce?: string;
};

export type GoogleSignInError =
  | "not_workspace"
  | "wrong_domain"
  | "email_unverified"
  | "nonce_mismatch";

export const OAUTH_COOKIE = "pd_google_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";

/** Must exactly match an "Authorized redirect URI" on the Google OAuth client. */
export function googleCallbackUrl(request: Request) {
  const base = process.env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
  return `${base}/api/auth/google/callback`;
}

/** Only same-site relative paths, so the flow can't be used as an open redirect. */
export function safeNextPath(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function base64url(buf: Buffer) {
  return buf.toString("base64url");
}

/**
 * Sign-in request, or (gmail: true) the one-time "send email as me" consent: adds the gmail.send
 * scope and asks for offline access so Google returns a refresh token.
 */
export function createOAuthRequest(redirectUri: string, opts: { gmail?: boolean; loginHint?: string } = {}) {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: opts.gmail ? "openid email https://www.googleapis.com/auth/gmail.send" : "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: opts.gmail ? "consent" : "select_account",
    ...(opts.gmail ? { access_type: "offline", include_granted_scopes: "true" } : {}),
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
    // Only a hint for Google's account picker; the hd claim is enforced on return.
    ...(allowedDomain() ? { hd: allowedDomain() } : {}),
  }).toString();

  return { url: url.toString(), state, nonce, verifier };
}

export async function exchangeCodeForIdToken(code: string, verifier: string, redirectUri: string) {
  return (await exchangeCode(code, verifier, redirectUri)).claims;
}

/** Exchanges the code; also returns the refresh token and granted scopes (Gmail consent). */
export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { id_token?: string; refresh_token?: string; scope?: string };
  if (!body.id_token) throw new Error("Google token response had no id_token");

  const { payload } = await jwtVerify<GoogleClaims>(body.id_token, JWKS, {
    issuer: ISSUERS,
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  return { claims: payload, refreshToken: body.refresh_token ?? null, scope: body.scope ?? "" };
}

/**
 * Checks the verified ID token belongs to a verified account in the allowed
 * Workspace domain. Returns the normalised email, or the reason it was refused.
 */
export function checkGoogleClaims(
  claims: GoogleClaims,
  expectedNonce: string,
  domain = allowedDomain(),
): { ok: true; email: string; name: string | null } | { ok: false; error: GoogleSignInError } {
  if (claims.nonce !== expectedNonce) return { ok: false, error: "nonce_mismatch" };
  if (claims.email_verified !== true || !claims.email) return { ok: false, error: "email_unverified" };
  const email = claims.email.toLowerCase();
  if (domain) {
    // hd is only present for Google Workspace accounts; personal Gmail has none.
    if (!claims.hd) return { ok: false, error: "not_workspace" };
    if (claims.hd.toLowerCase() !== domain || !isAllowedEmail(email, domain)) {
      return { ok: false, error: "wrong_domain" };
    }
  }
  return { ok: true, email, name: claims.name ?? null };
}
