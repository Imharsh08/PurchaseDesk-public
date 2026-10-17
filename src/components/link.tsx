"use client";

import { useEffect, useSyncExternalStore } from "react";
import NextLink, { useLinkStatus } from "next/link";

/**
 * App-wide <Link>: no prefetching unless asked for (`prefetch`).
 *
 * Every page here is dynamic, so a prefetch is a full server render (session, sidebar counts, the
 * record's metadata). Prefetching each link that scrolls into view, as next/link does, turned one
 * dashboard visit into dozens of Worker invocations and ran into the CPU limit. Instead a click
 * shows the top progress bar at once, and the loading skeleton follows with the first bytes.
 */
export default function Link({ prefetch = false, children, ...props }: React.ComponentProps<typeof NextLink>) {
  return (
    <NextLink prefetch={prefetch} {...props}>
      {children}
      <PendingReporter />
    </NextLink>
  );
}

// ── Navigation progress: pending links report here; <NavigationProgress> draws the bar. ──

let pendingLinks = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const setPending = (delta: number) => {
  pendingLinks = Math.max(0, pendingLinks + delta);
  listeners.forEach((fn) => fn());
};

function PendingReporter() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    setPending(1);
    return () => setPending(-1);
  }, [pending]);
  return null;
}

/** Thin bar across the top of the screen while a link's page loads. Mounted once in the app layout. */
export function NavigationProgress() {
  const active = useSyncExternalStore(
    subscribe,
    () => pendingLinks > 0,
    () => false,
  );
  if (!active) return null;
  return (
    <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15">
      <div className="h-full w-1/3 animate-[busy-slide_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
