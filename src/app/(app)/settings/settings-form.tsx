"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { StateField, TextAreaField, TextField, type FieldErrors } from "@/components/form-fields";
import { SaveState } from "@/components/save-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { PO_FORMAT_EXAMPLES, formatPONumber, initialsOf, patternOf, patternProblem, poCounterKey, resetsYearly } from "@/lib/po-number";
import { removeCompanyLogo, saveCompanySettings, uploadCompanyLogo } from "./actions";

export type CompanyValues = {
  name: string;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  poPrefix: string;
  poNumberStyle: string;
  defaultTerms: string | null;
  signatoryTitle: string | null;
  signatoryName: string | null;
  signatoryPhone: string | null;
  signatoryEmail: string | null;
};


export function SettingsForm({
  company,
  logos,
  lastIssued,
}: {
  company: CompanyValues;
  logos: { logo: boolean; logo2: boolean };
  lastIssued: Record<string, number>;
}) {
  const [errors, setErrors] = useState<FieldErrors>();
  const [pending, run] = useServerAction();
  const [format, setFormat] = useState(patternOf(company.poNumberStyle));
  const [prefix, setPrefix] = useState(company.poPrefix);
  const [next, setNext] = useState("");
  // The fields as last saved: Save is on only when they differ.
  const formRef = useRef<HTMLFormElement>(null);
  const savedFields = useRef<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const fields = () => Object.fromEntries([...new FormData(formRef.current!).entries()].map(([k, v]) => [k, String(v).trim()]));
  useEffect(() => {
    savedFields.current = fields();
  }, []);
  // A field missing from the first snapshot (the state dropdown adds its form field a moment after
  // loading) is compared with the saved setting.
  const differs = (now: Record<string, string>) =>
    Object.entries(now).some(([k, v]) => v !== (k in savedFields.current ? savedFields.current[k] : String((company as Record<string, unknown>)[k] ?? "").trim()));
  const onEdit = () => setDirty(differs(fields()));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    const sent = fields();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    run(
      () =>
        saveCompanySettings({
          ...values,
          name: values.name,
          poPrefix: values.poPrefix,
          poNumberStyle: values.poNumberStyle,
        }),
      {
        pending: "Saving settings…",
        success: "Company settings saved",
        onSuccess: () => {
          setErrors(undefined);
          savedFields.current = sent;
          setDirty(differs(fields()));
        },
        onError: (f) => setErrors(f.fieldErrors),
      },
    );
  }

  const last = lastIssued[poCounterKey(format)] ?? 0;
  const formatProblem = patternProblem(format);
  // Previewed as if the signatory had made the PO.
  const sample = company.signatoryName?.trim() || "G S";
  const preview = formatProblem ? null : formatPONumber(format, prefix || "PO", Number(next) || last + 1, new Date(), sample);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Letterhead logos</CardTitle>
          <CardDescription>
            Printed at the top of every PO: the first on the left above the company name, the second in the centre. PNG or JPG, up to 1 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <LogoSlot slot="logo" label="Left logo" initial={logos.logo} />
          <LogoSlot slot="logo2" label="Centre logo" initial={logos.logo2} />
        </CardContent>
      </Card>

      <form ref={formRef} onSubmit={onSubmit} onChange={onEdit}>
        <input type="hidden" name="signatoryTitle" value={company.signatoryTitle ?? ""} />
        <Card>
          <CardHeader>
            <CardTitle>Letterhead</CardTitle>
            <CardDescription>The top-right block of the PO, printed exactly as entered.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField name="name" label="Company name" required defaultValue={company.name} errors={errors} />
            <TextAreaField
              name="address"
              label="Letterhead address"
              rows={2}
              defaultValue={company.address ?? ""}
              placeholder={"Plot 12, MIDC Industrial Area,\nPune (MH) – 411001, India"}
              description="Printed in bold, one line per line."
              errors={errors}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="phone" label="Phone line" defaultValue={company.phone ?? ""} placeholder="020-2400 0000, Mobile: +91 90000 00000" errors={errors} className="sm:col-span-3" />
              <TextField name="email" label="Email" type="email" defaultValue={company.email ?? ""} errors={errors} />
              <TextField name="website" label="Website" defaultValue={company.website ?? ""} errors={errors} />
              <TextField name="gstin" label="GSTIN" defaultValue={company.gstin ?? ""} errors={errors} className="uppercase" />
            </div>
          </CardContent>

          <CardHeader className="border-t pt-6">
            <CardTitle>Tax registration</CardTitle>
            <CardDescription>Your state decides CGST + SGST vs IGST. Billing and shipping addresses are in the Addresses tab.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <TextField name="city" label="City" defaultValue={company.city ?? ""} errors={errors} />
              <StateField name="stateCode" label="State" defaultValue={company.stateCode} errors={errors} />
              <TextField name="pincode" label="PIN code" defaultValue={company.pincode ?? ""} errors={errors} />
              <TextField name="pan" label="PAN" defaultValue={company.pan ?? ""} errors={errors} className="uppercase" />
            </div>
          </CardContent>

          <CardHeader className="border-t pt-6">
            <CardTitle>Signatory</CardTitle>
            <CardDescription>Printed under &ldquo;Thanking you, Regards&rdquo;.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField name="signatoryName" label="Name" defaultValue={company.signatoryName ?? ""} placeholder="Amit Gupta" errors={errors} />
            <TextField name="signatoryPhone" label="Mobile" defaultValue={company.signatoryPhone ?? ""} placeholder="+91-90000 00000" errors={errors} />
            <TextField name="signatoryEmail" label="Email" type="email" defaultValue={company.signatoryEmail ?? ""} placeholder="purchase@yourcompany.com" errors={errors} />
          </CardContent>

          <CardHeader className="border-t pt-6">
            <CardTitle>PO numbering & terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
              <TextField name="poPrefix" label="Prefix" required value={prefix} onChange={(e) => setPrefix(e.target.value)} errors={errors} />
              <TextField
                name="poNumberStyle"
                label="Format"
                required
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                errors={formatProblem && format ? { poNumberStyle: [formatProblem] } : errors}
                description="{PREFIX} prefix · {INITIALS} sender's initials · {SEQ} serial (0047) · {FY} 26-27 · {FYLONG} 2026-27 · {YYYY} {YY} {MM}"
              />
              <TextField
                name="nextPoNumber"
                label="Next serial"
                type="number"
                min={last + 1}
                placeholder={String(last + 1)}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                description={last ? `Last issued: ${last}` : "Leave blank to start at 1"}
                errors={errors}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Formats:</span>
              {PO_FORMAT_EXAMPLES.map((f) => (
                <Button key={f.pattern} type="button" size="sm" variant={format === f.pattern ? "secondary" : "outline"} onClick={() => setFormat(f.pattern)}>
                  {f.label}
                </Button>
              ))}
              {preview && (
                <span className="ml-auto">
                  Next PO: <strong className="font-mono">{preview}</strong>{" "}
                  <span className="text-muted-foreground">
                    ({format.includes("{INITIALS}") ? `${initialsOf(sample)} = the initials of whoever made the PO; ` : ""}
                    {resetsYearly(format) ? "serial restarts each financial year" : "serial keeps running"})
                  </span>
                </span>
              )}
            </div>
            <TextAreaField
              name="defaultTerms"
              label="Default terms & conditions"
              rows={7}
              defaultValue={company.defaultTerms ?? ""}
              placeholder={"Delivery Period: 2-3 Days\nTransport: Thru Courier\nPacking & forwarding: As per standard packing\nGST: 18% IGST\nPayment terms: Immediate"}
              errors={errors}
              description="One term per line; numbering is added on the PO. Pre-filled on new POs and editable per PO."
            />
          </CardContent>
          <CardFooter className="justify-end gap-3">
            <SaveState dirty={dirty} />
            <Button type="submit" disabled={pending || !dirty}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function LogoSlot({ slot, label, initial }: { slot: "logo" | "logo2"; label: string; initial: boolean }) {
  const [has, setHas] = useState(initial);
  const [version, setVersion] = useState(0);
  // Shown the moment a file is picked (or removed), before the upload finishes.
  const [preview, setPreview] = useOptimistic<string | null | undefined>(undefined);
  const [pending, run] = useServerAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const src = preview === undefined ? (has ? `/api/branding/logo?slot=${slot}&v=${version}` : null) : preview;

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("logo", file);
    const local = URL.createObjectURL(file);
    run(
      async () => {
        setPreview(local);
        const result = await uploadCompanyLogo(slot, data);
        if (fileRef.current) fileRef.current.value = "";
        return result;
      },
      {
        pending: `Uploading ${label.toLowerCase()}…`,
        success: `${label} updated`,
        onSuccess: () => {
          setHas(true);
          setVersion((v) => v + 1);
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid h-20 w-full max-w-56 place-items-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className={cn("max-h-16 max-w-52 object-contain transition-opacity", pending && "opacity-60")} />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-2">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onChange} />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
          {has ? "Replace" : "Upload"}
        </Button>
        {src && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                async () => {
                  setPreview(null);
                  return removeCompanyLogo(slot);
                },
                { success: `${label} removed`, onSuccess: () => setHas(false) },
              )
            }
          >
            <Trash2Icon />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
