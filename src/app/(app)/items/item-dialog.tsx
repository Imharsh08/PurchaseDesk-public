"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { FormSection, SelectField, TextAreaField, TextField, type FieldErrors } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { COMMON_UOMS, GST_RATES } from "@/lib/gst";
import { saveItem } from "./actions";

export type ItemFormValues = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  uom: string;
  hsnCode: string | null;
  gstRate: string;
  specifications: string | null;
  /** Optional: data from an API not yet redeployed has no such field. */
  preferredTransport?: string | null;
  active: boolean;
  minStock: string | null;
  reorderQty: string | null;
  packUnit: string | null;
  packSize: string | null;
};

const GST_OPTIONS = GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }));

export function ItemDialog({
  item,
  categories,
  trigger,
}: {
  item?: ItemFormValues;
  categories: string[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>();
  const [pending, run] = useServerAction();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form) as Record<string, string>;
    run(
      () =>
        saveItem(item?.id ?? null, {
          ...values,
          sku: values.sku,
          name: values.name,
          uom: values.uom,
          gstRate: values.gstRate ?? "",
          minStock: values.minStock ?? "",
          reorderQty: values.reorderQty ?? "",
          packSize: values.packSize ?? "",
          active: form.get("active") === "on",
        }),
      {
        pending: item ? "Saving item…" : "Adding item…",
        success: item ? "Item updated" : "Item added",
        onSuccess: () => {
          setErrors(undefined);
          setOpen(false);
        },
        onError: (f) => setErrors(f.fieldErrors),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : "Add item"}</DialogTitle>
          <DialogDescription>HSN code and GST rate are copied onto every PO line for this item.</DialogDescription>
        </DialogHeader>

        <form id="item-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
            <TextField name="sku" label="Item code" required defaultValue={item?.sku} placeholder="RM-001" errors={errors} className="uppercase" />
            <TextField name="name" label="Item name" required defaultValue={item?.name} errors={errors} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="category" label="Category" list="item-categories" defaultValue={item?.category ?? ""} placeholder="Raw material" errors={errors} />
            <TextField name="uom" label="Unit of measure" required list="item-uoms" defaultValue={item?.uom ?? ""} placeholder="Kg" errors={errors} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="hsnCode" label="HSN code" inputMode="numeric" defaultValue={item?.hsnCode ?? ""} errors={errors} />
            <SelectField name="gstRate" label="GST rate" required defaultValue={item ? String(Number(item.gstRate)) : "18"} options={GST_OPTIONS} errors={errors} />
          </div>
          <TextAreaField name="description" label="Description" rows={2} defaultValue={item?.description ?? ""} errors={errors} />
          <TextAreaField name="specifications" label="Specifications" rows={2} defaultValue={item?.specifications ?? ""} placeholder="Grade, hardness, dimensions…" errors={errors} />
          <TextField
            name="preferredTransport"
            label="Always comes by"
            list="item-transport"
            defaultValue={item?.preferredTransport ?? ""}
            placeholder="e.g. Courier"
            maxLength={100}
            errors={errors}
            description="Only if this item always comes one way, whatever the vendor (e.g. small parcels by courier). It then goes on the PO instead of the vendor's transporter."
          />
          <datalist id="item-transport">
            <option value="Courier" />
            <option value="Thru Your Vehicle" />
          </datalist>

          <FormSection title="Stock settings" description="In the item's unit of measure. Used by the stock dashboard to suggest what to order.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="minStock" label="Minimum stock" inputMode="decimal" defaultValue={item?.minStock ?? ""} placeholder="e.g. 500" errors={errors} description="Below this, the item needs ordering" />
              <TextField name="reorderQty" label="Re-order qty" inputMode="decimal" defaultValue={item?.reorderQty ?? ""} placeholder="e.g. 250" errors={errors} description="Smallest quantity to order at a time" />
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_1fr] items-end gap-2">
              <span className="pb-2 text-sm text-muted-foreground">1</span>
              <TextField name="packUnit" label="Standard pack" list="item-packs" defaultValue={item?.packUnit ?? ""} placeholder="Bale" errors={errors} />
              <span className="pb-2 text-sm text-muted-foreground">=</span>
              <TextField name="packSize" label="Qty in item unit" inputMode="decimal" defaultValue={item?.packSize ?? ""} placeholder="25" errors={errors} />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">e.g. 1 Bale = 25 Kg, 1 Drum = 200 Ltr. Orders are rounded up to whole packs. Leave blank if not packed.</p>
          </FormSection>
          <Field orientation="horizontal" className="w-fit">
            <Switch id="item-active" name="active" defaultChecked={item?.active ?? true} />
            <FieldLabel htmlFor="item-active">Active</FieldLabel>
          </Field>
          <datalist id="item-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="item-packs">
            {["Bale", "Bag", "Drum", "Box", "Carton", "Roll", "Coil", "Can", "Pack"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <datalist id="item-uoms">
            {COMMON_UOMS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {item ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
