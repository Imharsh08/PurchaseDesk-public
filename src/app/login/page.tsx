import type { Metadata } from "next";
import { InfoIcon } from "lucide-react";
import { GoogleIcon, LoginShell, loginErrorMessage } from "@/components/login-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { allowedDomain, isGoogleSignInEnabled } from "@/lib/auth-config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error, email } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const domain = allowedDomain();
  const google = isGoogleSignInEnabled();
  const message = loginErrorMessage(typeof error === "string" ? error : undefined, typeof email === "string" ? email : undefined, domain);

  return (
    <LoginShell domain={domain} message={message}>
      {google ? (
        <>
          <Button asChild variant="outline" size="lg" className="h-11 w-full gap-3 text-[15px]">
            <a href={`/api/auth/google${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}>
              <GoogleIcon />
              Sign in with Google
            </a>
          </Button>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Use your {domain ? `@${domain} ` : ""}Google Workspace account. New staff need to be added by an administrator first.
          </p>
        </>
      ) : (
        <>
          <Alert className="mb-6">
            <InfoIcon />
            <AlertDescription>Sign in with the email and password your administrator gave you.</AlertDescription>
          </Alert>
          <LoginForm next={nextPath} />
        </>
      )}
    </LoginShell>
  );
}
