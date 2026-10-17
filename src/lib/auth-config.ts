/**
 * Who may use PurchaseDesk. Kept free of "server-only" so validation schemas
 * and tests can import it; it only reads non-secret configuration.
 */

/** Workspace domain whose accounts may sign in, e.g. "yourcompany.com". Empty = no restriction. */
export function allowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
}

export function isAllowedEmail(email: string, domain = allowedDomain()) {
  if (!domain) return true;
  return email.trim().toLowerCase().endsWith(`@${domain}`);
}

export function isGoogleSignInEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
