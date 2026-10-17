/**
 * Who is signed in. Loads /me once per sign-in and shares it with every screen; RequireAuth sends
 * signed-out visitors to the login page (and back to where they were afterwards).
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/roles";
import { Splash } from "@/components/splash";
import { api, clearToken, getToken } from "./api";
import { onRefresh } from "./data";

export type Me = {
  user: { id: number; name: string; email: string; roles: Role[]; department: string | null; active: boolean; approvalLimit: number | null; gmailConnected: boolean };
  permissions: Permission[];
  adminDelete: { allowed: boolean; passwordSet: boolean };
};

type Session = { me: Me | null; loading: boolean; error: string | null; signOut: () => void; reload: () => void };

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());
  const [error, setError] = useState<string | null>(null);

  // Fetch /me; state changes only when it answers.
  const load = useCallback(
    () =>
      api<Me>("/me")
        .then((m) => {
          setMe(m);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    if (getToken()) void load();
  }, [load]);

  // After an action, as the Next app re-renders its layout: what the frame knows about the user
  // (admin delete password set, Gmail connected, roles) is loaded again, quietly.
  useEffect(() => onRefresh(() => void (getToken() && load())), [load]);

  /** After signing in (or out): load the user again. */
  const reload = useCallback(() => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [load]);

  const signOut = useCallback(() => {
    clearToken();
    setMe(null);
    window.location.assign("/login");
  }, []);

  return <SessionContext.Provider value={{ me, loading, error, signOut, reload }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** May the signed-in user do this? (Buttons only — the API checks every action itself.) */
export function useCan() {
  const { me } = useSession();
  return (permission: Permission) => !!me?.permissions.includes(permission);
}

/** Screens for signed-in users only. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading, error } = useSession();
  const location = useLocation();
  if (!getToken()) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (loading) return <Splash />;
  if (!me) return <div className="p-8 text-sm text-destructive">{error ?? "Couldn't load your account."}</div>;
  return children;
}
