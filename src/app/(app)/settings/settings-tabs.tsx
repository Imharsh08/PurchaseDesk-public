"use client";

import { useSyncExternalStore } from "react";
import { Building2Icon, MailIcon, MapPinIcon, TimerIcon, TruckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings in tabs, one section at a time. The tab is the address's #hash, so a link like
 * /settings#tat (FMS → "Set TAT & doers") opens its tab, and a refresh stays on it.
 * Plain buttons, not the Radix tabs: that package pulls a second copy of React into the web build.
 */
const TABS = [
  { value: "company", label: "Company & PO", icon: Building2Icon },
  { value: "addresses", label: "Addresses", icon: MapPinIcon },
  { value: "transport", label: "Transport", icon: TruckIcon },
  { value: "tat", label: "FMS steps & TAT", icon: TimerIcon },
  { value: "notifications", label: "Email notifications", icon: MailIcon },
] as const;
type Tab = (typeof TABS)[number]["value"];

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash.slice(1);

export function SettingsTabs({ panels }: { panels: Record<Tab, React.ReactNode> }) {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const tab: Tab = TABS.some((t) => t.value === hash) ? (hash as Tab) : "company";

  const choose = (value: Tab) => {
    // Replace, not push: switching tabs shouldn't fill the back button.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${value}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <div className="space-y-6">
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Settings sections" className="inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`tab-${t.value}`}
              aria-selected={tab === t.value}
              aria-controls={`panel-${t.value}`}
              onClick={() => choose(t.value)}
              className={cn(
                "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === t.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {TABS.map((t) => (
        // Kept mounted while hidden, so unsaved edits survive switching tabs.
        <div key={t.value} role="tabpanel" id={`panel-${t.value}`} aria-labelledby={`tab-${t.value}`} hidden={tab !== t.value} className="space-y-6">
          {panels[t.value]}
        </div>
      ))}
    </div>
  );
}
