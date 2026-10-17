import { ChevronDownIcon, HistoryIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Entry = { id: number; action: string; description: string | null; createdAt: Date | string; user: { name: string } | null };

const POSITIVE = ["approve", "email", "send"];
const NEGATIVE = ["reject", "cancel"];

/**
 * The record of who did what, folded: the steps to act on are in "Where it is now". Open by
 * default where there is no timeline (`open`).
 */
export function ActivityLog({ entries, open = false, className }: { entries: Entry[]; open?: boolean; className?: string }) {
  return (
    <details className={cn("group rounded-xl border bg-card", className)} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
        <HistoryIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">Activity log</span>
        <span className="text-muted-foreground">({entries.length})</span>
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Show</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 py-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
            {entries.map((e) => (
              <li key={e.id} className="relative pl-6">
                <span
                  className={cn(
                    "absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-background ring-1",
                    POSITIVE.includes(e.action) ? "bg-primary ring-primary" : NEGATIVE.includes(e.action) ? "bg-destructive ring-destructive" : "bg-muted-foreground/40 ring-border",
                  )}
                />
                <div className="text-sm">{e.description}</div>
                <div className="text-xs text-muted-foreground">
                  {e.user?.name ?? "System"} · {formatDateTime(e.createdAt)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
