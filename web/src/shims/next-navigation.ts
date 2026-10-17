/**
 * Stand-in for "next/navigation" in the web app, so shared screens and components (written for
 * Next.js) run unchanged on React Router. Only what client code uses: usePathname, useSearchParams,
 * useRouter (push / replace / refresh / back / forward / prefetch).
 */
import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from "react-router";
import { refreshData } from "../data";

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useRRSearchParams()[0];
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      // Next re-renders the page with fresh server data; here the screen's data is fetched again.
      refresh: () => refreshData(),
      // Nothing to prefetch: screens load their data when opened.
      prefetch: () => {},
    }),
    [navigate],
  );
}

/** Server-only in Next; never called by client code. */
export function notFound(): never {
  throw new Error("notFound() is not available in the web app");
}
export function redirect(href: string): never {
  window.location.assign(href);
  throw new Error("redirecting");
}
