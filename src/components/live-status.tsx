"use client";

import { createContext, useContext, useOptimistic } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Instant feedback for actions, before the server answers:
 * - ActionBusy: while any action runs, a progress bar shows and the page's buttons are locked,
 *   so nobody clicks the same action twice. Dialogs (rendered outside the page) keep working.
 * - LiveStatus: a page's status (PO, indent, receipt, bill) switches to the expected new value the
 *   moment an action is confirmed; React puts the server's value back if the action fails.
 * Both use useOptimistic, so they reset by themselves when the action ends.
 */

const BusyContext = createContext<{ busy: boolean; mark: () => void } | null>(null);

export function ActionBusyProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useOptimistic(false);
  return <BusyContext.Provider value={{ busy, mark: () => setBusy(true) }}>{children}</BusyContext.Provider>;
}

/** Called by useServerAction inside the action's transition. */
export function useMarkBusy() {
  return useContext(BusyContext)?.mark;
}

/** The page area: buttons locked and a progress bar while an action runs. */
export function BusyRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  const busy = useContext(BusyContext)?.busy ?? false;
  return (
    <div
      data-busy={busy ? "" : undefined}
      aria-busy={busy}
      className={cn("data-busy:[&_button]:pointer-events-none data-busy:[&_button]:opacity-60 [&_button]:transition-opacity", className)}
    >
      {busy && (
        <div role="progressbar" aria-label="Working" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15">
          <div className="h-full w-1/3 animate-[busy-slide_1s_ease-in-out_infinite] bg-primary" />
        </div>
      )}
      {children}
    </div>
  );
}

type LiveStatusValue = { status: string; set: (status: string) => void };
const LiveStatusContext = createContext<LiveStatusValue | null>(null);

export function LiveStatusProvider({ status, children }: { status: string; children: React.ReactNode }) {
  const [optimistic, set] = useOptimistic(status);
  return <LiveStatusContext.Provider value={{ status: optimistic, set }}>{children}</LiveStatusContext.Provider>;
}

/** The page's current (possibly expected) status, and a setter to call inside an action. */
export function useLiveStatus<T extends string>(fallback: T): { status: T; set: (status: T) => void } {
  const ctx = useContext(LiveStatusContext);
  return { status: (ctx?.status ?? fallback) as T, set: (s: T) => ctx?.set(s) };
}

/** Status badge that follows the live status. */
export function LiveStatusBadge({
  labels,
  className,
}: {
  labels: Record<string, { label: string; tone: string }>;
  className?: string;
}) {
  const ctx = useContext(LiveStatusContext);
  const s = ctx ? labels[ctx.status] : undefined;
  if (!s) return null;
  return (
    <Badge className={cn("gap-1.5 border-transparent transition-colors", s.tone, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </Badge>
  );
}
