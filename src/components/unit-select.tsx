"use client";

/**
 * A unit picker for a quantity: the item's own unit and every unit it converts to (pack, unit
 * conversions, standard measures). Compact, to sit in or beside a quantity input.
 */
import { unitOptions, type UnitItem } from "@/lib/units";
import { cn } from "@/lib/utils";

export function UnitSelect({
  item,
  value,
  onChange,
  also = [],
  className,
  label = "Unit",
}: {
  item: UnitItem;
  value: string;
  onChange: (unit: string) => void;
  /** Units to offer besides the item's (e.g. the PO line's own unit). */
  also?: string[];
  className?: string;
  label?: string;
}) {
  const options = unitOptions(item, [value, ...also]);
  if (options.length < 2)
    return (
      <span className={cn("px-1 text-sm text-muted-foreground", className)} title="To use another unit, add a unit conversion for this item (Items → item → units)">
        {value}
      </span>
    );
  return (
    <select
      value={options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn("h-8 rounded-md border bg-background px-1.5 text-sm hover:border-primary/40 focus-visible:border-ring focus-visible:outline-none", className)}
    >
      {options.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}
