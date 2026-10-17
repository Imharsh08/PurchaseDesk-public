import "server-only";

import { db } from "@/lib/db";
import { buildMime, toGmailRaw, type MailMessage } from "@/lib/mime";
import { open, seal } from "@/lib/secret-box";

/**
 * "Send as me": each user connects their own Google Workspace mailbox once (gmail.send scope);
 * POs, RFQs and notifications then go out from their address via the Gmail API and appear in
 * their Sent folder. Plain fetch, so it works on Cloudflare Workers (no SMTP sockets).
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const PURPOSE = "gmail-refresh-token";

export class GmailNotConnected extends Error {
  constructor(message = "Connect your Gmail first (Send email as me).") {
    super(message);
  }
}

export async function saveGmailToken(userId: number, refreshToken: string) {
  await db.user.update({ where: { id: userId }, data: { gmailToken: await seal(refreshToken, PURPOSE), gmailConnectedAt: new Date() } });
}

export async function disconnectGmail(userId: number) {
  await db.user.update({ where: { id: userId }, data: { gmailToken: null, gmailConnectedAt: null } });
}

async function accessToken(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailToken: true } });
  if (!user?.gmailToken) throw new GmailNotConnected();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: await open(user.gmailToken, PURPOSE),
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    // Revoked or expired consent: clear it so the UI asks to reconnect.
    if (body.error === "invalid_grant") await disconnectGmail(userId);
    throw new GmailNotConnected(
      body.error === "invalid_grant" ? "Gmail access was revoked or expired. Connect your Gmail again." : `Google token refresh failed (${body.error ?? res.status}).`,
    );
  }
  return body.access_token;
}

export type Sender = { id: number; name: string; email: string };

/** Above this, the message goes as an upload (Gmail allows up to 35 MB) instead of inside JSON. */
const INLINE_LIMIT = 4 * 1024 * 1024;

/** Sends from the user's own mailbox. Throws GmailNotConnected if they haven't connected it. */
export async function sendAs(sender: Sender, message: Omit<MailMessage, "from">) {
  const token = await accessToken(sender.id);
  const mime = buildMime({ ...message, from: { name: sender.name, email: sender.email } });
  const res =
    mime.length > INLINE_LIMIT
      ? await fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "message/rfc822" },
          body: mime,
        })
      : await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: toGmailRaw(mime) }),
        });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 && /insufficient|scope/i.test(text)) throw new GmailNotConnected("Gmail permission is missing. Connect your Gmail again.");
    if (res.status === 403 && /has not been used|disabled/i.test(text)) throw new Error("The Gmail API is not enabled in the Google Cloud project. Ask the admin to enable it.");
    throw new Error(`Gmail send failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as { id: string };
}
