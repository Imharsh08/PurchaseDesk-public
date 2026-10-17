"use client";

import { CalendarDaysIcon } from "lucide-react";
import { useDateRangeSetter } from "@/components/date-range-picker";
import { ALL_DATES, resolveRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

/**
 * Shown on pages filtered by the top-bar date range, so nobody misses records hidden by it.
 * `what` names the date that is filtered, e.g. "PO date".
 */
export function DateRangeNotice({ value, what, className }: { value: string; what: string; className?: string }) {
  const { shown, apply } = useDateRangeSetter(value);
  const range = resolveRange(shown);
  if (!range) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm", className)}>
      <CalendarDaysIcon className="size-4 shrink-0 text-primary" />
      <span>
        Showing {what} in <span className="font-medium">{range.label}</span>
        {range.preset !== "custom" && <span className="text-muted-foreground"> ({range.span})</span>}
      </span>
      <button type="button" onClick={() => apply(ALL_DATES)} className="ml-auto text-sm font-medium text-primary hover:underline">
        Show all dates
      </button>
    </div>
  );
}
