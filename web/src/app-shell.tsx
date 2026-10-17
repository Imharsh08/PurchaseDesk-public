/**
 * The signed-in frame, as src/app/(app)/layout.tsx draws it in the Next app: sidebar with badges,
 * top bar (breadcrumb, date range, account), progress bar while a page or action loads. Screens
 * render in <Outlet />.
 */
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AdminDeleteProvider } from "@/components/admin-delete";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-top-bar";
import { NavigationProgress } from "@/components/link";
import { ActionBusyProvider, BusyRegion } from "@/components/live-status";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { sidebarCounts } from "@/lib/stock-data";
import { recordVisit } from "@/lib/nav-history";
import { setActionNavigator } from "./actions-bridge";
import { useApi } from "./data";
import { useRangeValue } from "./date-range";
import { useSession } from "./session";

type Counts = Awaited<ReturnType<typeof sidebarCounts>>;
const NO_COUNTS: Counts = { pendingPOs: 0, openIndents: 0, pendingComparisons: 0, belowMin: 0, pendingQc: 0, billsToPass: 0, pendingAmendments: 0 };

/** The sidebar remembers open / closed in a cookie (set by the sidebar itself). */
const sidebarOpen = () => !document.cookie.split("; ").includes("sidebar_state=false");

/**
 * Links to a section ("/settings#tat") scroll to it, as in the Next app. The section only exists
 * once the screen's data has loaded, so wait for it (up to 15 s).
 */
function useScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    const go = () => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return true;
    };
    if (go()) return;
    const watcher = new MutationObserver(() => go() && stop());
    const timer = setTimeout(() => stop(), 15_000);
    const stop = () => {
      watcher.disconnect();
      clearTimeout(timer);
    };
    watcher.observe(document.body, { childList: true, subtree: true });
    return stop;
  }, [pathname, hash]);
}

export function AppShell() {
  const { me } = useSession();
  const counts = useApi<Counts>("/sidebar-counts");
  const range = useRangeValue();
  const navigate = useNavigate();
  // An action that redirects (e.g. after deleting a record) moves within the app.
  useEffect(() => setActionNavigator((href) => navigate(href)), [navigate]);
  useScrollToHash();
  // A new screen fades in (keyed on the path: the same screen with new data doesn't).
  const { pathname, search } = useLocation();
  // The trail "back" links follow (src/lib/nav-history.ts).
  useEffect(() => recordVisit(pathname + search), [pathname, search]);
  if (!me) return null;
  return (
    <ActionBusyProvider>
      <SidebarProvider defaultOpen={sidebarOpen()}>
        <NavigationProgress />
        <AppSidebar user={me.user} counts={counts.data ?? NO_COUNTS} />
        {/* min-w-0: wide tables scroll inside their own box instead of stretching the page past the screen. */}
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-8">
            <AppTopBar user={me.user} canRaiseIndent={me.permissions.includes("raiseIndent")} dateRange={range} />
          </header>
          <BusyRegion className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <AdminDeleteProvider value={me.adminDelete}>
              <div key={pathname} className="screen-in">
                <Outlet />
              </div>
            </AdminDeleteProvider>
          </BusyRegion>
        </SidebarInset>
      </SidebarProvider>
    </ActionBusyProvider>
  );
}

/** Sets the browser tab title like the Next app ("Purchase orders · PurchaseDesk"); the top bar's breadcrumb reads it. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · PurchaseDesk` : "PurchaseDesk";
  }, [title]);
}
