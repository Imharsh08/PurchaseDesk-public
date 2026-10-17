"use client";

import { useEffect, useState } from "react";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  BoxesIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailCheckIcon,
  MailIcon,
  PackageCheckIcon,
  PlusIcon,
  ReceiptIndianRupeeIcon,
  ScaleIcon,
  SettingsIcon,
  StoreIcon,
  TableIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";
import { disconnectMyGmail } from "@/app/(app)/gmail-actions";
import { logout } from "@/app/login/actions";
import { DateRangePicker } from "@/components/date-range-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Role } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { dateFormatter, greeting } from "@/lib/format";
import { roleNames } from "@/lib/roles";
import { initials } from "@/lib/utils";

/** Top-level page → its name and icon (as in the sidebar). */
const PAGES: Record<string, { name: string; icon: LucideIcon }> = {
  "": { name: "Dashboard", icon: LayoutDashboardIcon },
  approvals: { name: "Approvals", icon: LayoutDashboardIcon },
  fms: { name: "FMS tracker", icon: TableIcon },
  reports: { name: "Reports", icon: BarChart3Icon },
  indents: { name: "Indents", icon: ClipboardListIcon },
  quotations: { name: "Quotations", icon: ScaleIcon },
  "purchase-orders": { name: "Purchase orders", icon: FileTextIcon },
  "goods-receipts": { name: "Goods receipts", icon: PackageCheckIcon },
  bills: { name: "Bills & payments", icon: ReceiptIndianRupeeIcon },
  stock: { name: "Stock", icon: WarehouseIcon },
  vendors: { name: "Vendors", icon: StoreIcon },
  items: { name: "Items", icon: BoxesIcon },
  import: { name: "Import from Excel", icon: FileSpreadsheetIcon },
  users: { name: "Users", icon: UsersIcon },
  settings: { name: "Company settings", icon: SettingsIcon },
};

const SUB: Record<string, string> = { new: "New", edit: "Edit", amend: "Amend", update: "Update stock" };

/** The record being viewed (e.g. "PO-2026-0090"), taken from the page title once it has loaded. */
function useRecordName(pathname: string) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const title = document.title.replace(/ · PurchaseDesk$/, "");
      setName(title && title !== "PurchaseDesk" ? title : null);
    };
    read();
    const el = document.querySelector("title");
    if (!el) return;
    const observer = new MutationObserver(read);
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return name;
}

export function AppTopBar({
  user,
  canRaiseIndent,
  dateRange,
}: {
  user: { name: string; email: string; roles: Role[]; gmailConnected: boolean };
  canRaiseIndent: boolean;
  /** The app-wide date range cookie value ("all" = all dates). */
  dateRange: string;
}) {
  const pathname = usePathname();
  const [, run] = useServerAction();
  const parts = pathname.split("/").filter(Boolean);
  const page = PAGES[parts[0] ?? ""] ?? { name: "PurchaseDesk", icon: LayoutDashboardIcon };
  const record = useRecordName(pathname);

  // Breadcrumb: Module › Record (› New / Edit…). The module carries its sidebar icon and links to
  // its list; Approvals sits under the Dashboard (it's one of its two views).
  const crumbs: { label: string; href?: string; icon?: LucideIcon }[] = [];
  if (parts[0] === "approvals") {
    crumbs.push({ label: "Dashboard", href: "/", icon: LayoutDashboardIcon }, { label: "Approvals" });
  } else crumbs.push({ label: page.name, href: parts.length > 1 ? `/${parts[0]}` : undefined, icon: page.icon });
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (parts[1] === "new") crumbs.push({ label: "New" });
    else if (/^\d+$/.test(parts[1])) {
      crumbs.push({ label: record ?? `#${parts[1]}`, href: parts.length > 2 ? `/${parts[0]}/${parts[1]}` : undefined });
      if (parts.length > 2) crumbs.push({ label: SUB[last] ?? last });
    } else crumbs.push({ label: SUB[last] ?? last });
  }

  const today = dateFormatter("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date());

  return (
    <>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            const Icon = c.icon;
            const body = (
              <>
                {Icon && <Icon className="size-4 shrink-0" />}
                <span className="truncate">{c.label}</span>
              </>
            );
            return (
              <li key={i} className={`flex min-w-0 items-center gap-1 ${!isLast && i < crumbs.length - 2 ? "hidden md:flex" : ""}`}>
                {c.href && !isLast ? (
                  <Link href={c.href} className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    {body}
                  </Link>
                ) : (
                  <span className={`inline-flex min-w-0 items-center gap-1.5 px-1.5 py-1 ${isLast ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{body}</span>
                )}
                {!isLast && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <span className="hidden text-sm text-muted-foreground tabular lg:inline" suppressHydrationWarning>
        {today}
      </span>
      <DateRangePicker value={dateRange} />
      <Separator orientation="vertical" className="mx-1 hidden data-[orientation=vertical]:h-4 sm:block" />
      {canRaiseIndent && (
        <Button asChild size="sm">
          <Link href="/indents/new">
            <PlusIcon />
            <span className="hidden sm:inline">New indent</span>
          </Link>
        </Button>
      )}
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative rounded-full ring-offset-2 ring-offset-background transition hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Account menu"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user.name)}</AvatarFallback>
            </Avatar>
            {!user.gmailConnected && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-amber-500" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <div className="text-xs text-muted-foreground" suppressHydrationWarning>
              {greeting()},
            </div>
            <div className="text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">{roleNames(user.roles)}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.gmailConnected ? (
            <DropdownMenuItem
              onSelect={() => run(() => disconnectMyGmail(), { pending: "Disconnecting Gmail…", success: "Gmail disconnected" })}
            >
              <MailCheckIcon className="text-emerald-600" />
              <span className="flex-1">Gmail connected</span>
              <span className="text-xs text-muted-foreground">Disconnect</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <a href={`/api/auth/google/gmail?next=${encodeURIComponent(pathname)}`}>
                <MailIcon className="text-amber-600" />
                Connect Gmail (send as me)
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <form action={logout}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOutIcon />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
