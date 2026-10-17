"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { allowedDomain, isAllowedEmail, isGoogleSignInEnabled } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginState = { error?: string; email?: string } | undefined;

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
let dummyHash: string | undefined;
// Computed on first use rather than at startup (Workers charge CPU time at module load).
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("timing-equaliser", 10));

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };
  }
  const { email, password, next } = parsed.data;

  // Once Google sign-in is configured it is the only way in.
  if (isGoogleSignInEnabled()) return { error: "Please use “Sign in with Google”.", email };
  if (!isAllowedEmail(email)) {
    return { error: `Only @${allowedDomain()} accounts can sign in.`, email };
  }

  const user = await db.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !user.passwordHash || !valid) return { error: "Incorrect email or password.", email };
  if (!user.active) return { error: "Your account is disabled. Contact your administrator.", email };

  await createSession(user.id);

  // Only allow same-site relative redirects.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
