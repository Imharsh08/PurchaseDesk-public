import { useEffect, useState } from "react";
import { LogOutIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleNames } from "@/lib/roles";
import { API_URL, api } from "../api";
import { useSession } from "../session";

/** Placeholder until the screens arrive (phase 3): shows the sign-in and the API connection work. */
export function Home() {
  const { me, signOut } = useSession();
  const [ping, setPing] = useState<{ ms: number } | string | null>(null);

  useEffect(() => {
    const t0 = performance.now();
    api("/ping").then(
      () => setPing({ ms: Math.round(performance.now() - t0) }),
      (e: Error) => setPing(e.message),
    );
  }, []);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PurchaseDesk</h1>
          <p className="text-sm text-muted-foreground">New app — preview. Screens are being built.</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOutIcon />
          Sign out
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{me?.user.name}</CardTitle>
          <CardDescription>
            {me?.user.email} · {me ? roleNames(me.user.roles) : ""} · {me?.permissions.length} permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          <span className="truncate text-muted-foreground">API {API_URL.replace(/^https:\/\//, "")}</span>
          {ping === null ? (
            <Badge variant="secondary">Checking…</Badge>
          ) : typeof ping === "string" ? (
            <Badge variant="destructive">{ping}</Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Reachable · {ping.ms} ms</Badge>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
