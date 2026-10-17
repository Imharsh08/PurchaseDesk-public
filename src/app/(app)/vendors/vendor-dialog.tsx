"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { FormSection, SelectField, StateField, TextAreaField, TextField, type FieldErrors } from "@/components/form-fields";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SuggestInput } from "@/components/suggest-input";
import { CERTIFICATION_LABELS } from "@/lib/quote-scoring";
import { routeLabel, transportChoices, type TransportOptions } from "@/lib/transport";
import { saveVendor } from "./actions";

const CERT_OPTIONS = (Object.keys(CERTIFICATION_LABELS) as (keyof typeof CERTIFICATION_LABELS)[]).map((k) => ({
  value: k,
  label: CERTIFICATION_LABELS[k],
}));

const MSME_OPTIONS = [
  { value: "MICRO", label: "Micro" },
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
];

export type VendorFormValues = {
  id: number;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  /** Optional: data from an API not yet redeployed has no such field. */
  preferredTransport?: string | null;
  creditDays: number | null;
  msme: boolean;
  msmeNumber: string | null;
  msmeCategory: string | null;
  certification: "ISO_9001" | "ISO_OTHER" | "CUSTOMER" | "NONE";
  notes: string | null;
  active: boolean;
};

export function VendorDialog({
  vendor,
  trigger,
  transport,
}: {
  vendor?: VendorFormValues;
  trigger: React.ReactNode;
  /** The transport list (Settings → Transport), to suggest a transporter for the vendor's city. */
  transport?: TransportOptions;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>();
  const [pending, run] = useServerAction();
  // Followed as typed, so the transport suggestions match the city.
  const [place, setPlace] = useState({ city: vendor?.city ?? "", address: vendor?.address ?? "" });
  const choice = transport ? transportChoices(transport, place) : null;
  const route = transport && choice ? routeLabel(transport.settings, choice.city) : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form) as Record<string, string>;
    run(
      () =>
        saveVendor(vendor?.id ?? null, {
          ...values,
          code: values.code,
          name: values.name,
          leadTimeDays: values.leadTimeDays ? Number(values.leadTimeDays) : null,
          creditDays: values.creditDays ?? "",
          msme: form.get("msme") === "on",
          msmeCategory: (values.msmeCategory || null) as "MICRO" | "SMALL" | "MEDIUM" | null,
          certification: (values.certification || "NONE") as VendorFormValues["certification"],
          active: form.get("active") === "on",
        }),
      {
        pending: vendor ? "Saving vendor…" : "Adding vendor…",
        success: vendor ? "Vendor updated" : "Vendor added",
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
        else setPlace({ city: vendor?.city ?? "", address: vendor?.address ?? "" });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vendor ? `Edit ${vendor.name}` : "Add vendor"}</DialogTitle>
          <DialogDescription>
            The vendor&apos;s state decides whether POs carry CGST + SGST or IGST.
          </DialogDescription>
        </DialogHeader>

        <form id="vendor-form" onSubmit={onSubmit} className="space-y-6">
          <FormSection title="Basic details">
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <TextField name="code" label="Vendor code" required defaultValue={vendor?.code} placeholder="V-001" errors={errors} className="uppercase" />
              <TextField name="name" label="Vendor name" required defaultValue={vendor?.name} placeholder="Registered business name" errors={errors} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="contactPerson" label="Contact person" defaultValue={vendor?.contactPerson ?? ""} errors={errors} />
              <TextField name="email" label="Email" type="email" defaultValue={vendor?.email ?? ""} errors={errors} description="POs are emailed here" />
              <TextField name="phone" label="Phone" defaultValue={vendor?.phone ?? ""} errors={errors} />
            </div>
          </FormSection>

          <Separator />

          <FormSection title="Address & tax">
            <TextAreaField
              name="address"
              label="Address"
              rows={2}
              defaultValue={vendor?.address ?? ""}
              onChange={(e) => setPlace((p) => ({ ...p, address: e.target.value }))}
              errors={errors}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="city" label="City" defaultValue={vendor?.city ?? ""} onChange={(e) => setPlace((p) => ({ ...p, city: e.target.value }))} errors={errors} />
              <StateField name="stateCode" label="State" defaultValue={vendor?.stateCode} errors={errors} />
              <TextField name="pincode" label="PIN code" inputMode="numeric" defaultValue={vendor?.pincode ?? ""} errors={errors} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="gstin" label="GSTIN" defaultValue={vendor?.gstin ?? ""} placeholder="22AAAAA0000A1Z5" errors={errors} className="uppercase" />
              <TextField name="pan" label="PAN" defaultValue={vendor?.pan ?? ""} errors={errors} className="uppercase" />
            </div>
            <Field data-invalid={!!errors?.preferredTransport}>
              <FieldLabel htmlFor="preferredTransport">Preferred transport</FieldLabel>
              <SuggestInput
                id="preferredTransport"
                name="preferredTransport"
                defaultValue={vendor?.preferredTransport ?? ""}
                suggestions={choice?.options ?? []}
                placeholder={choice?.recommended ?? "e.g. Vijay Lakshmi Transport, Courier, Thru Your Vehicle"}
                maxLength={100}
              />
              <FieldDescription>
                {!choice
                  ? "Printed on new POs to this vendor."
                  : choice.recommended
                    ? `Printed on new POs to this vendor. Leave empty to use ${route}: ${choice.recommended}.`
                    : "Printed on new POs to this vendor. No transporter is listed for this city yet (Settings → Transport): type the one they send with."}
              </FieldDescription>
            </Field>
          </FormSection>

          <Separator />

          <FormSection title="Commercial terms">
            <div className="grid gap-4 sm:grid-cols-[1fr_130px_130px]">
              <TextField name="paymentTerms" label="Payment terms" defaultValue={vendor?.paymentTerms ?? ""} placeholder="e.g. 30 days from invoice" errors={errors} />
              <TextField name="creditDays" label="Credit days" type="number" min={0} defaultValue={vendor?.creditDays ?? ""} errors={errors} description="Bill due date" />
              <TextField name="leadTimeDays" label="Lead time (days)" type="number" min={0} defaultValue={vendor?.leadTimeDays ?? ""} errors={errors} />
            </div>
            <SelectField name="certification" label="Certification" defaultValue={vendor?.certification ?? "NONE"} options={CERT_OPTIONS} errors={errors} description="Used in quotation scoring" className="sm:max-w-64" />
            <div className="grid items-end gap-4 rounded-lg border p-3 sm:grid-cols-[auto_160px_1fr]">
              <Field orientation="horizontal" className="w-fit sm:pb-2">
                <Switch id="msme" name="msme" defaultChecked={vendor?.msme ?? false} />
                <FieldLabel htmlFor="msme">MSME registered</FieldLabel>
              </Field>
              <SelectField name="msmeCategory" label="Category" defaultValue={vendor?.msmeCategory ?? ""} options={MSME_OPTIONS} placeholder="Select" errors={errors} />
              <TextField name="msmeNumber" label="Udyam registration no." defaultValue={vendor?.msmeNumber ?? ""} placeholder="UDYAM-UP-28-0012345" errors={errors} />
              <p className="text-xs text-muted-foreground sm:col-span-3">Micro and small enterprises must be paid within 45 days of accepting the goods (MSMED Act, sec. 15). Bills for MSME vendors are due accordingly.</p>
            </div>
            <TextAreaField name="notes" label="Internal notes" rows={2} defaultValue={vendor?.notes ?? ""} errors={errors} />
            <Field orientation="horizontal" className="w-fit">
              <Switch id="active" name="active" defaultChecked={vendor?.active ?? true} />
              <FieldLabel htmlFor="active">Active, can receive new POs</FieldLabel>
            </Field>
          </FormSection>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {vendor ? "Save changes" : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
