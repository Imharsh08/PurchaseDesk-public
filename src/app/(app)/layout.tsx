import { Suspense } from "react";
import { cookies } from "next/headers";
import { AdminDeleteProvider } from "@/components/admin-delete";
import { AppSidebar } from "@/components/app-sidebar";
import { ActionBusyProvider, BusyRegion } from "@/components/live-status";
import { AppTopBar } from "@/components/app-top-bar";
import { NavigationProgress } from "@/components/link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/dal";
import { getDateRangeValue } from "@/lib/date-range-server";
import { db } from "@/lib/db";
import { isPasswordHash } from "@/lib/password-hash";
import { can, canHardDelete } from "@/lib/roles";
import { sidebarCounts } from "@/lib/stock-data";
import { GmailFlag } from "./gmail";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const deleteAdmin = canHardDelete(user.email);
  const [counts, cookieStore, dateRange, deletePassword] = await Promise.all([
    sidebarCounts(),
    cookies(),
    getDateRangeValue(),
    deleteAdmin ? db.companySettings.findUnique({ where: { id: 1 }, select: { deletePasswordHash: true } }) : null,
  ]);
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <ActionBusyProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <NavigationProgress />
        <AppSidebar user={user} counts={counts} />
        <Suspense>
          <GmailFlag />
        </Suspense>
        {/* min-w-0: wide tables scroll inside their own box instead of stretching the page past the screen. */}
        <SidebarInset className="min-w-0">
          {/* App bar: breadcrumb on the left; date, actions and account on the right. Same height as the sidebar header. */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-8">
            <AppTopBar user={user} canRaiseIndent={can(user.roles, "raiseIndent")} dateRange={dateRange} />
          </header>
          {/* Full width: pages use the whole area beside the sidebar (the whole screen when it is collapsed). */}
          {/* BusyRegion: while an action runs, a progress bar shows and the page's buttons are locked. */}
          <BusyRegion className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <AdminDeleteProvider value={{ allowed: deleteAdmin, passwordSet: isPasswordHash(deletePassword?.deletePasswordHash) }}>{children}</AdminDeleteProvider>
          </BusyRegion>
        </SidebarInset>
      </SidebarProvider>
    </ActionBusyProvider>
  );
}
