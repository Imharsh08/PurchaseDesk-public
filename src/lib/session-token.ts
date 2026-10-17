import { SignJWT, jwtVerify } from "jose";

// Kept free of "server-only" so proxy.ts and the API (api/) can use it too.

export const SESSION_COOKIE = "pd_session";

export type SessionPayload = {
  userId: number;
  expiresAt: string;
};

/** A signed-in session lasts one working day. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** A new session token for the user: the Next app keeps it in a cookie, the web app sends it to the API. */
export async function signSessionToken(userId: number) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = await new SignJWT({ userId, expiresAt: expiresAt.toISOString() } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionKey());
  return { token, expiresAt };
}

export async function decrypt(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, sessionKey(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}
