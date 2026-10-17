import { useEffect, useState } from "react";
import { InfoIcon, Loader2Icon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { GoogleIcon, LoginShell, loginErrorMessage } from "@/components/login-shell";
import { Splash } from "@/components/splash";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL, api, safeNext, setToken } from "../api";
import { useSession } from "../session";

type AuthConfig = { google: boolean; domain: string | null };

/** Sign-in: Google for workspace accounts; password only while Google isn't configured (same rule as before). */
export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    api<AuthConfig>("/auth/config").then(setConfig, (e: Error) => setFailed(e.message));
  }, []);

  const domain = config?.domain ?? "";
  const message = failed ?? loginErrorMessage(params.get("error") ?? undefined, params.get("email") ?? undefined, domain);
  const googleHref = `${API_URL}/auth/google?return=${encodeURIComponent(location.origin)}&next=${encodeURIComponent(next)}`;

  return (
    <LoginShell domain={domain} message={message}>
      {!config ? (
        !failed && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Checking sign-in options…
          </p>
        )
      ) : config.google ? (
        <>
          <Button asChild variant="outline" size="lg" className="h-11 w-full gap-3 text-[15px]">
            <a href={googleHref}>
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
          <PasswordForm next={next} />
        </>
      )}
    </LoginShell>
  );
}

function PasswordForm({ next }: { next: string }) {
  const navigate = useNavigate();
  const { reload } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>("/auth/password", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      setToken(token);
      reload();
      navigate(next, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

/** Google sends the user back through the API to here, with the session token in the address fragment. */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { reload } = useSession();
  // Read once, on the first render: the effect below clears it from the address bar.
  const [{ token, next }] = useState(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    return { token: hash.get("token"), next: safeNext(hash.get("next")) };
  });
  useEffect(() => {
    // Drop the token from the address bar and history straight away.
    history.replaceState(null, "", location.pathname);
    if (!token) {
      navigate("/login?error=expired", { replace: true });
      return;
    }
    setToken(token);
    reload();
    navigate(next, { replace: true });
  }, [navigate, reload, token, next]);
  return <Splash message="Signing you in…" />;
}
