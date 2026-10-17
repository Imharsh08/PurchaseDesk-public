/** Links to mail settings (no secrets: shared by the server and the browser). */

/** Link that starts the one-time Gmail consent and comes back to `next`. */
export function connectGmailHref(next: string) {
  return `/api/auth/google/gmail?next=${encodeURIComponent(next)}`;
}
