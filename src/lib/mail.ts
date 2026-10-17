import "server-only";

export { connectGmailHref } from "@/lib/mail-links";

import { GmailNotConnected, sendAs, type Sender } from "@/lib/gmail";
import type { MailAttachment } from "@/lib/mime";

export { GmailNotConnected };

/**
 * Email always goes out from the signed-in user's own Workspace mailbox (Gmail API, "send as me").
 * Users connect it once; see /api/auth/google/gmail.
 */
export async function sendMail(
  sender: Sender,
  message: { to: string[]; cc?: string[]; replyTo?: string; subject: string; text: string; html?: string; attachments?: MailAttachment[] },
) {
  return sendAs(sender, message);
}

