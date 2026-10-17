"use client";

/**
 * Overview ⇄ Approvals: the two dashboards. The one picked last is remembered in this browser and
 * opens as the home page (HomePreference redirects "/" to it).
 */
import { useEffect } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { LayoutDashboardIcon, ListChecksIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Home = "overview" | "approvals";
const KEY = "pd_home";

export function readHome(): Home {
  try {
    return localStorage.getItem(KEY) === "approvals" ? "approvals" : "overview";
  } catch {
    return "overview";
  }
}
function saveHome(home: Home) {
  try {
    localStorage.setItem(KEY, home);
  } catch {
    // Storage blocked: the switch still works, it just isn't remembered.
  }
}

export function DashboardSwitch({ current, approvals }: { current: Home; /** Items waiting, shown on the Approvals side. */ approvals?: number }) {
  const options = [
    { home: "overview" as const, href: "/", label: "Overview", icon: LayoutDashboardIcon },
    { home: "approvals" as const, href: "/approvals", label: "Approvals", icon: ListChecksIcon },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Dashboard">
      {options.map((o) => (
        <Link
          key={o.home}
          href={o.href}
          role="tab"
          aria-selected={current === o.home}
          onClick={() => saveHome(o.home)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            current === o.home ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <o.icon className="size-4" />
          {o.label}
          {o.home === "approvals" && !!approvals && current !== "approvals" && (
            <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white tabular">{approvals}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** On the overview: opens Approvals instead when that's the chosen home. */
export function HomePreference() {
  const router = useRouter();
  useEffect(() => {
    if (readHome() === "approvals") router.replace("/approvals");
  }, [router]);
  return null;
}
