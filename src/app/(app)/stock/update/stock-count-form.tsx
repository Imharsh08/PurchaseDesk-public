"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, SaveIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime, formatQty, parseNumber } from "@/lib/format";
import { describePacks, fromPacks, toPacks } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { saveStockCounts } from "../actions";

export type CountItem = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  uom: string;
  packUnit: string | null;
  packSize: number | null;
  minStock: number | null;
  current: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  stale: boolean;
};

type Entry = { packs: string; loose: string };

// Blank = null; pasted "1,250.5" counts as 1250.5.
const num = parseNumber;

export function StockCountForm({ items }: { items: CountItem[] }) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [note, setNote] = useState("");

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort(), [items]);
  const visible = items.filter((i) => {
    if (category !== "all" && i.category !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q);
  });

  const hasPacks = (i: CountItem) => !!i.packUnit && !!i.packSize;
  /** Entered quantity in base units, or null if the row wasn't touched / is invalid. */
  const entered = (i: CountItem): number | null => {
    const e = entries[i.id];
    if (!e) return null;
    const packs = num(e.packs);
    const loose = num(e.loose);
    if (packs === null && loose === null) return null;
    if ((packs !== null && (!Number.isFinite(packs) || packs < 0)) || (loose !== null && (!Number.isFinite(loose) || loose < 0))) return NaN;
    return hasPacks(i) ? fromPacks(packs ?? 0, loose ?? 0, i.packSize) : (loose ?? 0);
  };
  const changed = items.map((i) => ({ i, q: entered(i) })).filter((x) => x.q !== null);
  const invalid = changed.filter((x) => Number.isNaN(x.q));

  const set = (id: number, patch: Partial<Entry>) =>
    setEntries((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { packs: "", loose: "" }), ...patch } }));

  function fillFromLast(i: CountItem) {
    if (i.current === null) return;
    const split = hasPacks(i) ? toPacks(i.current, i.packSize) : null;
    set(i.id, split ? { packs: String(split.packs), loose: split.loose ? String(split.loose) : "" } : { loose: String(i.current) });
  }

  function save() {
    if (invalid.length) return void toast.error("Some quantities aren't valid numbers.");
    run(() => saveStockCounts({ counts: changed.map((x) => ({ itemId: x.i.id, quantity: x.q! })), note }), {
      pending: `Saving stock for ${changed.length} item${changed.length === 1 ? "" : "s"}…`,
      success: (data) => `Stock saved for ${data.saved} item${data.saved === 1 ? "" : "s"}`,
      onSuccess: () => {
        setEntries({});
        router.push("/stock");
      },
    });
  }

  return (
    <div>
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
          <InputGroup className="sm:w-72">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item or code" aria-label="Search items" />
          </InputGroup>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-52" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {visible.length} of {items.length} items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="py-2.5 pl-4">Item</th>
                <th className="py-2.5 pr-3 text-right">Last count</th>
                <th className="w-[340px] py-2.5 pr-3">Counted now</th>
                <th className="w-40 py-2.5 pr-4 text-right">New stock</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const q = entered(i);
                const e = entries[i.id] ?? { packs: "", loose: "" };
                const delta = q !== null && !Number.isNaN(q) && i.current !== null ? q - i.current : null;
                return (
                  <tr key={i.id} className={cn("border-b align-middle last:border-b-0", q !== null && "bg-primary/5")}>
                    <td className="py-2.5 pl-4">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.sku}
                        {hasPacks(i) && ` · 1 ${i.packUnit} = ${formatQty(i.packSize)} ${i.uom}`}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {i.current === null ? (
                        <span className="text-muted-foreground">Never counted</span>
                      ) : (
                        <button type="button" className="text-right hover:text-primary" onClick={() => fillFromLast(i)} title="Use last count">
                          <div className="tabular">{describePacks(i.current, i, formatQty)}</div>
                          <div className={cn("text-xs", i.stale ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                            {i.updatedAt ? formatDateTime(i.updatedAt) : ""}
                          </div>
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {hasPacks(i) ? (
                        <div className="flex items-center gap-2">
                          <InputGroup className="w-36">
                            <InputGroupInput
                              inputMode="decimal"
                              value={e.packs}
                              onChange={(ev) => set(i.id, { packs: ev.target.value })}
                              className="text-right tabular"
                              placeholder="0"
                              aria-label={`${i.name} ${i.packUnit} count`}
                            />
                            <InputGroupAddon align="inline-end">{i.packUnit}</InputGroupAddon>
                          </InputGroup>
                          <span className="text-muted-foreground">+</span>
                          <InputGroup className="w-32">
                            <InputGroupInput
                              inputMode="decimal"
                              value={e.loose}
                              onChange={(ev) => set(i.id, { loose: ev.target.value })}
                              className="text-right tabular"
                              placeholder="0"
                              aria-label={`${i.name} loose ${i.uom}`}
                            />
                            <InputGroupAddon align="inline-end">{i.uom}</InputGroupAddon>
                          </InputGroup>
                        </div>
                      ) : (
                        <InputGroup className="w-40">
                          <InputGroupInput
                            inputMode="decimal"
                            value={e.loose}
                            onChange={(ev) => set(i.id, { loose: ev.target.value })}
                            className="text-right tabular"
                            placeholder="Qty"
                            aria-label={`${i.name} stock in ${i.uom}`}
                          />
                          <InputGroupAddon align="inline-end">{i.uom}</InputGroupAddon>
                        </InputGroup>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular">
                      {q === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : Number.isNaN(q) ? (
                        <span className="text-destructive">Invalid</span>
                      ) : (
                        <>
                          <div className="font-medium">
                            {formatQty(q)} {i.uom}
                          </div>
                          {delta !== null && delta !== 0 && (
                            <div className={cn("text-xs", delta < 0 ? "text-rose-600" : "text-emerald-600")}>
                              {delta > 0 ? "+" : ""}
                              {formatQty(delta)} since last
                            </div>
                          )}
                          {i.minStock !== null && q < i.minStock && (
                            <Badge className="mt-0.5 h-4 border-transparent bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Below min {formatQty(i.minStock)}
                            </Badge>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for this count (optional), e.g. Weekly count, main store"
            className="sm:max-w-md"
            aria-label="Count note"
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-sm text-muted-foreground">
              {changed.length} item{changed.length === 1 ? "" : "s"} entered
            </span>
            <Button variant="ghost" asChild>
              <Link href="/stock">Cancel</Link>
            </Button>
            <Button onClick={save} disabled={pending || changed.length === 0}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Save stock
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
