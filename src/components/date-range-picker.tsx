"use client";

import { useOptimistic, useState } from "react";
import { CalendarDaysIcon, CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { setDateRange } from "@/app/(app)/date-range-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerAction } from "@/hooks/use-server-action";
import { ALL_DATES, RANGE_PRESETS, customValue, resolveRange, todayIST } from "@/lib/date-range";
import { cn } from "@/lib/utils";

/** Applies a range to the whole app ("all" = all dates). */
export function useDateRangeSetter(value: string) {
  const [shown, setShown] = useOptimistic(value);
  const [pending, run] = useServerAction();
  const apply = (next: string) => {
    if (next === shown) return;
    run(() => setDateRange(next), { optimistic: () => setShown(next) });
  };
  return { shown, apply, pending };
}

/** Top-bar pill: presets, a custom From–To, and "All dates". */
export function DateRangePicker({ value }: { value: string }) {
  const { shown, apply } = useDateRangeSetter(value);
  const range = resolveRange(shown);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const choose = (next: string) => {
    apply(next);
    setOpen(false);
  };

  return (
    <div className="flex items-center">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            // Start the custom fields from the current range (or today).
            setFrom(range?.from ?? todayIST());
            setTo(range?.to ?? todayIST());
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5 font-normal", range && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary", range && "rounded-r-none border-r-0")}
            title={range ? `Showing ${range.span} across the app` : "Filter every page by date"}
          >
            <CalendarDaysIcon />
            <span className="hidden max-w-44 truncate sm:inline">{range?.label ?? "All dates"}</span>
            <ChevronDownIcon className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <div className="border-b px-3 py-2">
            <div className="text-sm font-medium">Date range</div>
            <div className="text-xs text-muted-foreground">Applies to every list, report and record page.</div>
          </div>
          <ul className="p-1">
            {[{ key: ALL_DATES, label: "All dates" }, ...RANGE_PRESETS].map((p) => {
              const active = shown === p.key;
              const span = resolveRange(p.key)?.span;
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => choose(p.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                      active && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
                    )}
                  >
                    <span className="flex-1">{p.label}</span>
                    {span && <span className="text-xs font-normal text-muted-foreground tabular">{span}</span>}
                    {active && <CheckIcon className="size-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="space-y-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && to) choose(customValue(from, to));
            }}
          >
            <div className="text-xs font-medium text-muted-foreground">Custom range</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                From
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 px-2 text-xs" required />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                To
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 px-2 text-xs" required />
              </label>
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={!from || !to}>
              Apply
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      {range && (
        <Button
          variant="outline"
          size="icon-sm"
          className="rounded-l-none border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => apply(ALL_DATES)}
          aria-label="Clear date range (show all dates)"
          title="Show all dates"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
