import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE, signSessionToken } from "@/lib/session-token";

export { SESSION_COOKIE, decrypt } from "@/lib/session-token";

export async function createSession(userId: number) {
  const { token, expiresAt } = await signSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
