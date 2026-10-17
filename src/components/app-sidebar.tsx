"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  BoxesIcon,
  FileSpreadsheetIcon,
  ReceiptIndianRupeeIcon,
  TableIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailCheckIcon,
  MailIcon,
  PackageCheckIcon,
  ScaleIcon,
  SettingsIcon,
  StoreIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";
import { disconnectMyGmail } from "@/app/(app)/gmail-actions";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { Role } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { can, roleNames, type Permission } from "@/lib/roles";
import { initials } from "@/lib/utils";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  soon?: boolean;
  badge?: number;
};

export function AppSidebar({
  user,
  counts,
}: {
  user: { name: string; email: string; roles: Role[]; gmailConnected: boolean };
  counts: {
    pendingPOs: number;
    openIndents: number;
    pendingComparisons: number;
    belowMin: number;
    pendingQc: number;
    billsToPass: number;
    pendingAmendments: number;
  };
}) {
  const pathname = usePathname();
  const [, run] = useServerAction();

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Overview",
      items: [
        { title: "Dashboard", href: "/", icon: LayoutDashboardIcon },
        { title: "FMS tracker", href: "/fms", icon: TableIcon },
        { title: "Reports", href: "/reports", icon: BarChart3Icon, permission: "viewReports" },
      ],
    },
    {
      label: "Procurement",
      items: [
        { title: "Indents", href: "/indents", icon: ClipboardListIcon, badge: can(user.roles, "manageQuotations") ? counts.openIndents : undefined },
        {
          title: "Quotations",
          href: "/quotations",
          icon: ScaleIcon,
          badge: can(user.roles, "approveComparison") ? counts.pendingComparisons : undefined,
        },
        {
          title: "Purchase Orders",
          href: "/purchase-orders",
          icon: FileTextIcon,
          badge: can(user.roles, "approvePO") ? counts.pendingPOs + counts.pendingAmendments : undefined,
        },
        {
          title: "Goods Receipt",
          href: "/goods-receipts",
          icon: PackageCheckIcon,
          badge: can(user.roles, "qualityCheck") ? counts.pendingQc : undefined,
        },
      ],
    },
    {
      label: "Accounts",
      items: [
        {
          title: "Bills & payments",
          href: "/bills",
          icon: ReceiptIndianRupeeIcon,
          permission: "enterBill",
          badge: can(user.roles, "passBill") ? counts.billsToPass : undefined,
        },
      ],
    },
    {
      label: "Inventory",
      items: [
        {
          title: "Stock",
          href: "/stock",
          icon: WarehouseIcon,
          badge: can(user.roles, "updateStock") ? counts.belowMin : undefined,
        },
      ],
    },
    {
      label: "Masters",
      items: [
        { title: "Vendors", href: "/vendors", icon: StoreIcon },
        { title: "Items", href: "/items", icon: BoxesIcon },
        { title: "Import from Excel", href: "/import", icon: FileSpreadsheetIcon, permission: "importData" },
      ],
    },
    {
      label: "Administration",
      items: [
        { title: "Users", href: "/users", icon: UsersIcon, permission: "manageUsers" },
        { title: "Company Settings", href: "/settings", icon: SettingsIcon, permission: "manageSettings" },
      ],
    },
  ];

  // The dashboard has two views (Overview, Approvals): both light up "Dashboard".
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname === "/approvals" : pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link href="/" className="flex items-center group-data-[collapsible=icon]:justify-center">
          <Logo className="group-data-[collapsible=icon]:[&>span:last-child]:hidden" />
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        {groups.map((group) => {
          const items = group.items.filter((i) => !i.permission || can(user.roles, i.permission));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      {item.soon ? (
                        <SidebarMenuButton tooltip={`${item.title} (coming soon)`} disabled className="opacity-55">
                          <item.icon />
                          <span>{item.title}</span>
                          <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[10px] font-normal">
                            Soon
                          </Badge>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      )}
                      {!!item.badge && (
                        <SidebarMenuBadge className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
                          {item.badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleNames(user.roles)}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
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
                      <MailIcon />
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
