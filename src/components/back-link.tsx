"use client";

/**
 * A page's "← back" link: to the page the user came from (named, e.g. "← FMS tracker") when there
 * is one in this tab, else to `href` (the module's list) with its own label.
 */
import { useSyncExternalStore } from "react";
import Link from "@/components/link";
import { ArrowLeftIcon } from "lucide-react";
import { backTarget, pageName } from "@/lib/nav-history";

const noop = () => () => {};

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  // Read once on the client (the trail lives in sessionStorage); the server renders the plain link.
  const target = useSyncExternalStore(
    noop,
    () => backTarget(window.location.pathname),
    () => null,
  );
  return (
    <Link href={target ?? href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-3.5" />
      {target ? pageName(target) : children}
    </Link>
  );
}
