"use client";

import { useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ClipboardPlusIcon, HourglassIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatQty } from "@/lib/format";
import { STOCK_STATUS, describePacks, type StockPosition } from "@/lib/stock";
import { cn } from "@/lib/utils";

export type StockTableRow = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  uom: string;
  packUnit: string | null;
  packSize: number | null;
  minStock: number | null;
  reorderQty: number | null;
  current: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  stale: boolean;
  onOrder: number;
  position: StockPosition;
};

const BAR_TONE: Record<string, string> = {
  OUT: "bg-rose-500",
  BELOW_MIN: "bg-amber-500",
  NEAR_MIN: "bg-yellow-400",
  OK: "bg-emerald-500",
};

function SortHead({
  id,
  sort,
  sortHref,
  children,
  className,
}: {
  id: string;
  sort: string;
  sortHref: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("py-2.5 font-medium", className)}>
      <Link href={sortHref[id]} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === id && "text-foreground")}>
        {children}
        {sort === id && <ArrowDownIcon className="size-3" />}
      </Link>
    </th>
  );
}

export function StockTable({
  rows,
  sort,
  sortHref,
  canIndent,
}: {
  rows: StockTableRow[];
  sort: string;
  sortHref: Record<string, string>;
  canIndent: boolean;
}) {
  const router = useRouter();
  const orderable = rows.filter((r) => r.position.suggested > 0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function raiseIndent() {
    const picks = rows.filter((r) => selected.has(r.id));
    const param = picks.map((r) => `${r.id}:${r.position.suggested || r.reorderQty || r.minStock || 1}`).join(",");
    router.push(`/indents/new?items=${encodeURIComponent(param)}`);
  }


  return (
    <>
      {canIndent && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-2.5 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={orderable.length === 0}
            onClick={() => setSelected(new Set(orderable.map((r) => r.id)))}
          >
            Select all to order ({orderable.length})
          </Button>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          )}
          <Button size="sm" className="ml-auto" disabled={selected.size === 0} onClick={raiseIndent}>
            <ClipboardPlusIcon />
            Raise indent{selected.size ? ` (${selected.size})` : ""}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              {canIndent && <th className="w-10 py-2.5 pl-4" />}
              <SortHead sort={sort} sortHref={sortHref} id="name" className={canIndent ? "" : "pl-4"}>
                Item
              </SortHead>
              <SortHead sort={sort} sortHref={sortHref} id="stock" className="text-right">
                In stock
              </SortHead>
              <SortHead sort={sort} sortHref={sortHref} id="min" className="text-right">
                Minimum
              </SortHead>
              <SortHead sort={sort} sortHref={sortHref} id="critical" className="w-40 pl-4">
                Level
              </SortHead>
              <th className="py-2.5 pr-3 text-right font-medium">On order</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="py-2.5 pr-3 text-right font-medium">Suggested order</th>
              <SortHead sort={sort} sortHref={sortHref} id="updated" className="pr-4">
                Counted
              </SortHead>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = STOCK_STATUS[r.position.status];
              const pct = r.minStock && r.current !== null ? Math.min(100, (r.current / (r.minStock * 1.5)) * 100) : 0;
              return (
                <tr key={r.id} className={cn("border-b align-middle last:border-b-0", selected.has(r.id) && "bg-primary/5")}>
                  {canIndent && (
                    <td className="py-3 pl-4">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                    </td>
                  )}
                  <td className={cn("py-3 pr-3", !canIndent && "pl-4")}>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.sku}
                      {r.category ? ` · ${r.category}` : ""}
                      {r.packUnit && r.packSize ? ` · 1 ${r.packUnit} = ${formatQty(r.packSize)} ${r.uom}` : ""}
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right tabular">
                    {r.current === null ? <span className="text-muted-foreground">—</span> : describePacks(r.current, r, formatQty)}
                    {r.current !== null && r.packUnit && (
                      <div className="text-xs text-muted-foreground">
                        {formatQty(r.current)} {r.uom}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right tabular">
                    {r.minStock === null ? (
                      <span className="text-muted-foreground">Not set</span>
                    ) : (
                      <>
                        {formatQty(r.minStock)} {r.uom}
                        {r.reorderQty !== null && <div className="text-xs text-muted-foreground">re-order {formatQty(r.reorderQty)}</div>}
                      </>
                    )}
                  </td>
                  <td className="py-3 pl-4 pr-3">
                    {r.minStock !== null && r.current !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="py-1.5" tabIndex={0} aria-label={`${Math.round(r.position.ratio * 100)}% of minimum`}>
                            <div className="relative h-2 rounded-full bg-muted">
                              <div className={cn("h-2 rounded-full", BAR_TONE[r.position.status] ?? "bg-muted-foreground")} style={{ width: `${Math.max(3, pct)}%` }} />
                              {/* minimum marker at 2/3 of the bar (bar spans 0 → 150% of minimum) */}
                              <div className="absolute inset-y-[-3px] left-2/3 w-px bg-foreground/50" />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {Math.round(r.position.ratio * 100)}% of minimum (line marks the minimum)
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right tabular">
                    {r.onOrder > 0 ? (
                      <>
                        {formatQty(r.onOrder)} <span className="text-muted-foreground">{r.uom}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge className={cn("border-transparent", s.tone)}>{s.label}</Badge>
                    {r.position.coveredByOrders && <div className="mt-0.5 text-xs text-muted-foreground">Covered by open orders</div>}
                  </td>
                  <td className="py-3 pr-3 text-right tabular">
                    {r.position.suggested > 0 ? (
                      <>
                        <div className="font-semibold">{describePacks(r.position.suggested, r, formatQty)}</div>
                        {r.packUnit && (
                          <div className="text-xs text-muted-foreground">
                            {formatQty(r.position.suggested)} {r.uom}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-sm">
                    {r.updatedAt ? (
                      <div className={cn(r.stale && "text-amber-700 dark:text-amber-400")}>
                        {r.stale && <HourglassIcon className="mr-1 inline size-3.5" />}
                        {formatDate(r.updatedAt)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                    {r.updatedBy && <div className="text-xs text-muted-foreground">{r.updatedBy}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
