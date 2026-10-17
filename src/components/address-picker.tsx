"use client";

import { useState } from "react";
import { Loader2Icon, MapPinIcon, PlusIcon } from "lucide-react";
import { createAddress, updateAddress } from "@/app/(app)/settings/address-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import type { AddressOption } from "@/lib/addresses";
import { cn } from "@/lib/utils";

const NEW = "__new";
const CUSTOM = "__custom";

const firstLine = (text: string) => text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";

/** Address text as it prints on the PO: first line bold, line breaks kept. */
export function AddressBlock({ text, className }: { text: string; className?: string }) {
  const [head, ...rest] = text.split(/\r?\n/).map((l) => l.trim());
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <div className="font-medium">{head}</div>
      {rest.length > 0 && <div className="whitespace-pre-line text-muted-foreground">{rest.filter(Boolean).join("\n")}</div>}
    </div>
  );
}

/**
 * Dropdown of saved addresses with a preview of the selected one and "Add new address".
 * `value` is the address text stored on the PO; a text that matches no saved entry shows as "This PO's address".
 */
export function AddressPicker({
  id,
  label,
  value,
  onChange,
  addresses,
  onAdded,
  canSetDefaults,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  addresses: AddressOption[];
  /** A new address was saved: the parent adds it to its list (it is selected here). */
  onAdded: (address: AddressOption) => void;
  canSetDefaults: boolean;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const matched = addresses.find((a) => a.details.trim() === value.trim());
  const selected = matched ? String(matched.id) : value.trim() ? CUSTOM : "";

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={selected}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === NEW) return setAdding(true);
          const address = addresses.find((a) => String(a.id) === v);
          if (address) onChange(address.details);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose an address" />
        </SelectTrigger>
        <SelectContent>
          {selected === CUSTOM && <SelectItem value={CUSTOM}>This PO&apos;s address — {firstLine(value)}</SelectItem>}
          {addresses.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              <span className="truncate">{a.label}</span>
              <span className="truncate text-xs text-muted-foreground">{firstLine(a.details)}</span>
            </SelectItem>
          ))}
          {(addresses.length > 0 || selected === CUSTOM) && <SelectSeparator />}
          <SelectItem value={NEW} className="text-primary">
            <PlusIcon className="text-primary" />
            Add new address
          </SelectItem>
        </SelectContent>
      </Select>
      <div className="rounded-md border bg-muted/30 px-3 py-2.5">
        {value.trim() ? (
          <AddressBlock text={value} />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPinIcon className="size-3.5" />
            No address chosen
          </p>
        )}
      </div>
      <AddressDialog
        open={adding}
        onOpenChange={setAdding}
        canSetDefaults={canSetDefaults}
        onSaved={(address) => {
          onAdded(address);
          onChange(address.details);
        }}
      />
    </Field>
  );
}

/** Create (no `address`) or edit an address book entry. */
export function AddressDialog({
  open,
  onOpenChange,
  address,
  canSetDefaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: AddressOption;
  canSetDefaults: boolean;
  onSaved: (address: AddressOption) => void;
}) {
  const blank = () => ({
    label: address?.label ?? "",
    details: address?.details ?? "",
    defaultBilling: address?.defaultBilling ?? false,
    defaultShipping: address?.defaultShipping ?? false,
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [pending, run] = useServerAction();

  function save() {
    run(() => (address ? updateAddress(address.id, form) : createAddress(form)), {
      pending: address ? "Saving address…" : "Adding address…",
      success: (a) => (address ? `“${a.label}” updated` : `“${a.label}” added`),
      onSuccess: (a) => {
        onSaved(a);
        onOpenChange(false);
        setErrors(undefined);
        if (!address) setForm(blank());
      },
      onError: (f) => setErrors(f.fieldErrors),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setForm(blank());
          setErrors(undefined);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "Add new address"}</DialogTitle>
          <DialogDescription>Saved for future POs. It prints exactly as typed; the first line is bold.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={!!errors?.label}>
            <FieldLabel htmlFor="address-label">Name</FieldLabel>
            <Input
              id="address-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Plant 2 – Pune"
              autoFocus
            />
            {errors?.label && <FieldError>{errors.label[0]}</FieldError>}
          </Field>
          <Field data-invalid={!!errors?.details}>
            <FieldLabel htmlFor="address-details">Address as printed</FieldLabel>
            <Textarea
              id="address-details"
              rows={6}
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              placeholder={"Your Company Pvt. Ltd.\nGSTIN: 27AAACY5678G1ZW (Plant 2)\nPlot 12, MIDC Industrial Area,\nPune, PIN-411001, Maharashtra\nTel.: +91-20-0000-0000"}
            />
            {errors?.details ? <FieldError>{errors.details[0]}</FieldError> : <FieldDescription>Include GSTIN and phone if they should print.</FieldDescription>}
          </Field>
          {canSetDefaults && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={form.defaultBilling} onCheckedChange={(v) => setForm({ ...form, defaultBilling: v === true })} />
                Default billing address
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={form.defaultShipping} onCheckedChange={(v) => setForm({ ...form, defaultShipping: v === true })} />
                Default shipping address
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !form.label.trim() || form.details.trim().length < 5}>
            {pending && <Loader2Icon className="animate-spin" />}
            {address ? "Save address" : "Add address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
