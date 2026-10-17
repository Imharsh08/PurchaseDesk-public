"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatQty } from "@/lib/format";
import { UnitSelect } from "@/components/unit-select";
import type { UnitItem } from "@/lib/units";
import { saveIndent } from "./actions";

export type IndentItemOption = { id: number; sku: string; name: string; uom: string; category: string | null; /** Units it can be asked in. */ unitItem?: UnitItem };

/** `uom`: the unit the quantity is asked in (the item's own unless changed). */
type Line = { key: string; itemId: number | null; description: string; quantity: string; currentStock: string; remarks: string; uom: string };

export type IndentFormInitial = {
  department: string;
  priority: "NORMAL" | "URGENT";
  requiredBy: string;
  purpose: string;
  items: Omit<Line, "key">[];
};

let seed = 0;
const key = () => `l-${Date.now()}-${seed++}`;
const blank = (): Line => ({ key: key(), itemId: null, description: "", quantity: "", currentStock: "", remarks: "", uom: "" });

export function IndentForm({
  indentId,
  initial,
  items,
}: {
  indentId?: number;
  initial: IndentFormInitial;
  items: IndentItemOption[];
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [mode, setMode] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [header, setHeader] = useState({
    department: initial.department,
    priority: initial.priority,
    requiredBy: initial.requiredBy,
    purpose: initial.purpose,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    initial.items.length ? initial.items.map((l) => ({ ...l, key: key() })) : [blank()],
  );

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const options = useMemo(
    () =>
      items.map((i) => ({
        value: String(i.id),
        label: i.name,
        hint: [i.sku, i.category, i.uom].filter(Boolean).join(" · "),
        keywords: [i.sku, i.category ?? ""],
      })),
    [items],
  );
  const filled = lines.filter((l) => l.itemId || l.quantity);
  const err = (k: string) => errors?.[k]?.[0];

  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  function save(submit: boolean) {
    setMode(submit ? "submit" : "draft");
    run(
      () =>
        saveIndent(
          indentId ?? null,
          {
            ...header,
            items: filled.map((l) => ({
              itemId: l.itemId ?? 0,
              description: l.description,
              quantity: l.quantity,
              currentStock: l.currentStock,
              remarks: l.remarks,
              uom: l.uom || undefined,
            })),
          },
          submit,
        ),
      {
        pending: submit ? "Sending to purchase…" : "Saving draft…",
        success: submit ? "Indent sent to purchase" : "Draft saved",
        onSuccess: (data) => router.push(`/indents/${data.id}`),
        onError: (f) => {
          setMode(null);
          setErrors(f.fieldErrors);
        },
      },
    );
  }

  return (
    <div>
      <div className="space-y-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Requirement</CardTitle>
            <CardDescription>Who needs the material, by when, and why.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="department">Department</FieldLabel>
                <Input
                  id="department"
                  value={header.department}
                  onChange={(e) => setHeader({ ...header, department: e.target.value })}
                  placeholder="Production, Maintenance, Stores…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="priority">Priority</FieldLabel>
                <Select value={header.priority} onValueChange={(v) => setHeader({ ...header, priority: v as "NORMAL" | "URGENT" })}>
                  <SelectTrigger id="priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>Urgent weighs delivery time more when comparing quotes.</FieldDescription>
              </Field>
              <Field data-invalid={!!err("requiredBy")}>
                <FieldLabel htmlFor="requiredBy">Required by</FieldLabel>
                <Input
                  id="requiredBy"
                  type="date"
                  value={header.requiredBy}
                  onChange={(e) => setHeader({ ...header, requiredBy: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="purpose">Purpose / justification</FieldLabel>
              <Textarea
                id="purpose"
                rows={2}
                value={header.purpose}
                onChange={(e) => setHeader({ ...header, purpose: e.target.value })}
                placeholder="e.g. Stock below minimum for next week's production run"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>Items required</CardTitle>
            <CardDescription>Enter the quantity needed. Current stock is optional and helps purchase see the shortfall.</CardDescription>
          </CardHeader>
          {err("items") && <p className="px-4 pt-3 text-sm text-destructive">{err("items")}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-10 py-2.5 pl-4">#</th>
                  <th className="py-2.5 pr-2">Item</th>
                  <th className="w-44 py-2.5 pr-2 text-right">Qty required</th>
                  <th className="w-32 py-2.5 pr-2 text-right">Current stock</th>
                  <th className="w-10 py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const item = line.itemId ? itemMap.get(line.itemId) : null;
                  const prefix = `items.${filled.indexOf(line)}`;
                  return (
                    <tr key={line.key} className="border-b align-top last:border-b-0">
                      <td className="py-3 pl-4 text-muted-foreground tabular">{index + 1}</td>
                      <td className="py-2 pr-2">
                        <Combobox
                          options={options}
                          value={line.itemId ? String(line.itemId) : null}
                          onChange={(v) => {
                            const it = itemMap.get(Number(v));
                            if (it) update(line.key, { itemId: it.id, description: it.name, uom: it.uom });
                          }}
                          placeholder="Select item"
                          searchPlaceholder="Search items…"
                          invalid={!!err(`${prefix}.itemId`)}
                          contentClassName="min-w-96"
                        />
                        <Input
                          value={line.remarks}
                          onChange={(e) => update(line.key, { remarks: e.target.value })}
                          placeholder="Specification / note (grade, size, make…)"
                          className="mt-1.5 h-7 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => update(line.key, { quantity: e.target.value })}
                            aria-invalid={!!err(`${prefix}.quantity`)}
                            className="min-w-0 text-right tabular"
                            placeholder="0"
                          />
                          {item &&
                            (item.unitItem ? (
                              <UnitSelect item={item.unitItem} value={line.uom || item.uom} onChange={(uom) => update(line.key, { uom })} label={`${line.description} unit`} className="w-20 shrink-0" />
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground" title="To order in another unit, add a unit conversion for this item (Items → item → units)">{item.uom}</span>
                            ))}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          inputMode="decimal"
                          value={line.currentStock}
                          onChange={(e) => update(line.key, { currentStock: e.target.value })}
                          className="text-right tabular"
                          placeholder="—"
                        />
                        {item && line.quantity && line.currentStock !== "" && (
                          <div className="mt-1 text-right text-xs text-muted-foreground">
                            {formatQty(Number(line.currentStock))} in stock
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove line ${index + 1}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setLines((ls) => (ls.length === 1 ? [blank()] : ls.filter((l) => l.key !== line.key)))}
                        >
                          <Trash2Icon />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t bg-muted/20 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
              <PlusIcon />
              Add item
            </Button>
            <span className="text-xs text-muted-foreground">
              {lines.filter((l) => l.itemId).length} item{lines.filter((l) => l.itemId).length === 1 ? "" : "s"}
            </span>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={indentId ? `/indents/${indentId}` : "/indents"}>Cancel</Link>
          </Button>
          <Button variant="outline" onClick={() => save(false)} disabled={pending}>
            {pending && mode === "draft" && <Loader2Icon className="animate-spin" />}
            Save as draft
          </Button>
          <Button onClick={() => save(true)} disabled={pending}>
            {pending && mode === "submit" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send to purchase
          </Button>
        </div>
      </div>
    </div>
  );
}
