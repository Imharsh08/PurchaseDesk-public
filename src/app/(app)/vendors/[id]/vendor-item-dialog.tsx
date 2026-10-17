"use client";

import { useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { removeVendorItem, saveVendorItem } from "../actions";

export type VendorItemValues = {
  id: number;
  itemId: number;
  vendorItemCode: string | null;
  rate: string | null;
  leadTimeDays: number | null;
  preferred: boolean;
  active: boolean;
  notes: string | null;
};

export function VendorItemDialog({
  vendorId,
  items,
  link,
  trigger,
}: {
  vendorId: number;
  items: { id: number; name: string; sku: string; uom: string }[];
  link?: VendorItemValues;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useServerAction();
  const blank = () => ({
    itemId: link ? String(link.itemId) : "",
    vendorItemCode: link?.vendorItemCode ?? "",
    rate: link?.rate ?? "",
    leadTimeDays: link?.leadTimeDays?.toString() ?? "",
    preferred: link?.preferred ?? false,
    active: link?.active ?? true,
    notes: link?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const item = items.find((i) => String(i.id) === form.itemId);

  function save() {
    run(() => saveVendorItem(vendorId, { ...form, itemId: form.itemId }), {
      pending: "Saving…",
      success: link ? "Saved" : "Item linked to vendor",
      onSuccess: () => setOpen(false),
    });
  }

  function remove() {
    if (!link) return;
    run(() => removeVendorItem(link.id), { pending: "Removing…", success: "Removed", onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setForm(blank());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{link ? "Edit supplied item" : "Add an item this vendor supplies"}</DialogTitle>
          <DialogDescription>
            The rate updates automatically from new quotations and POs; set it here for an agreed / contract rate.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="vi-item">Item</FieldLabel>
            {link ? (
              <Input id="vi-item" value={item ? `${item.name} (${item.sku})` : ""} disabled />
            ) : (
              <Combobox
                id="vi-item"
                value={form.itemId || null}
                onChange={(itemId) => setForm({ ...form, itemId })}
                placeholder="Select item"
                searchPlaceholder="Search items"
                options={items.map((i) => ({ value: String(i.id), label: i.name, hint: `${i.sku} · ${i.uom}`, keywords: [i.sku] }))}
              />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="vi-rate">Rate (₹, before GST)</FieldLabel>
            <InputGroup>
              <InputGroupInput id="vi-rate" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className="text-right tabular" />
              <InputGroupAddon align="inline-end">/ {item?.uom ?? "unit"}</InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="vi-lead">Lead time</FieldLabel>
            <InputGroup>
              <InputGroupInput id="vi-lead" inputMode="numeric" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} className="text-right tabular" />
              <InputGroupAddon align="inline-end">days</InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="vi-code">Brand / grade / vendor&apos;s code</FieldLabel>
            <Input
              id="vi-code"
              value={form.vendorItemCode}
              onChange={(e) => setForm({ ...form, vendorItemCode: e.target.value })}
              placeholder="e.g. Royalene 511, Colgate, N330-HS"
              maxLength={60}
            />
            <FieldDescription>What this vendor supplies for the item, when vendors sell different brands or grades.</FieldDescription>
          </Field>
          <Field orientation="horizontal" className="self-end">
            <Switch id="vi-pref" checked={form.preferred} onCheckedChange={(preferred) => setForm({ ...form, preferred })} />
            <FieldLabel htmlFor="vi-pref">Preferred vendor for this item</FieldLabel>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="vi-notes">Notes</FieldLabel>
            <Textarea id="vi-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Rate valid till 31 Mar; min order 1 MT" />
          </Field>
          {link && (
            <Field orientation="horizontal" className="sm:col-span-2">
              <Switch id="vi-active" checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
              <FieldLabel htmlFor="vi-active">Still supplies this item</FieldLabel>
              <FieldDescription className="ml-auto">Turn off instead of deleting to keep it in history</FieldDescription>
            </Field>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {link ? (
            <Button variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
              <Trash2Icon />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.itemId}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
