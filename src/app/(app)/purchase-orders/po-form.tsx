"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  BuildingIcon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { AddressPicker } from "@/components/address-picker";
import { Combobox } from "@/components/combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { SuggestInput } from "@/components/suggest-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useServerAction } from "@/hooks/use-server-action";
import type { AddressOption } from "@/lib/addresses";
import { formatAmount, formatINR, formatQty, toNumber } from "@/lib/format";
import { GST_RATES } from "@/lib/gst";
import { calcLine, calcTotals, determineTaxMode, type LineInput } from "@/lib/po-calc";
import { termsTransporter, withTransport } from "@/lib/po-transporter";
import { stateName } from "@/lib/states";
import { itemTransport, routeLabel, transportChoices, type TransportOptions } from "@/lib/transport";
import { cn } from "@/lib/utils";
import { UnitSelect } from "@/components/unit-select";
import type { UnitItem } from "@/lib/units";
import { savePurchaseOrder } from "./actions";

export type VendorOption = {
  id: number;
  code: string;
  name: string;
  city: string | null;
  stateCode: string | null;
  gstin: string | null;
  email: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  // For the transport suggestion (optional: an API not yet redeployed doesn't send them).
  address?: string | null;
  preferredTransport?: string | null;
};

export type ItemOption = {
  id: number;
  sku: string;
  name: string;
  uom: string;
  hsnCode: string | null;
  gstRate: number;
  category: string | null;
  /** How it always comes, whatever the vendor (e.g. Courier); beats the vendor's transporter. */
  preferredTransport?: string | null;
  /** Units it can be ordered in. */
  unitItem?: UnitItem;
};

type Line = {
  key: string;
  itemId: number | null;
  description: string;
  quantity: string;
  rate: string;
  discountPct: string;
  gstRate: string;
  remarks: string;
  /** The unit the line is ordered in (the item's own unless changed). */
  uom: string;
};

export type POFormInitial = {
  vendorId: number | null;
  expectedDeliveryDate: string;
  quotationRef: string;
  quotationDate: string;
  billingAddress: string;
  deliveryAddress: string;
  paymentTerms: string;
  terms: string;
  internalNotes: string;
  items: Omit<Line, "key">[];
};

let keySeed = 0;
const newKey = () => `line-${Date.now()}-${keySeed++}`;
const blankLine = (): Line => ({
  key: newKey(),
  itemId: null,
  description: "",
  quantity: "",
  rate: "",
  discountPct: "",
  gstRate: "18",
  remarks: "",
  uom: "",
});

// Pasted "66,750.00" counts as 66750 (commas, ₹ ignored).
const num = (v: string) => toNumber(v);

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function POForm({
  poId,
  locked = false,
  initial,
  vendors,
  items,
  company,
  addresses: savedAddresses,
  canSetDefaultAddress,
  transport,
}: {
  /** The transport list (Settings → Transport), to suggest the transporter for the vendor's city. */
  transport?: TransportOptions;
  poId?: number;
  initial: POFormInitial;
  /** PO created from an approved comparison: vendor and lines are read-only. */
  locked?: boolean;
  vendors: VendorOption[];
  items: ItemOption[];
  company: { name: string; stateCode: string | null };
  addresses: AddressOption[];
  canSetDefaultAddress: boolean;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [submitMode, setSubmitMode] = useState<"draft" | "submit" | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>();

  const [vendorId, setVendorId] = useState<number | null>(initial.vendorId);
  const [header, setHeader] = useState({
    expectedDeliveryDate: initial.expectedDeliveryDate,
    quotationRef: initial.quotationRef,
    quotationDate: initial.quotationDate,
    billingAddress: initial.billingAddress,
    deliveryAddress: initial.deliveryAddress,
    paymentTerms: initial.paymentTerms,
    terms: initial.terms,
    internalNotes: initial.internalNotes,
  });
  const [addresses, setAddresses] = useState(savedAddresses);
  const [lines, setLines] = useState<Line[]>(() =>
    initial.items.length ? initial.items.map((l) => ({ ...l, key: newKey() })) : [blankLine()],
  );

  const vendor = vendors.find((v) => v.id === vendorId) ?? null;
  // Transport: its own box, kept in step with the "Transport:" line of the terms (which is what prints).
  const [transportText, setTransportText] = useState(() => termsTransporter(initial.terms) ?? "");
  const [transportTouched, setTransportTouched] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const forItem = itemTransport(lines.map((l) => (l.itemId ? itemMap.get(l.itemId) : null)));
  const choice = vendor && transport ? transportChoices(transport, vendor, forItem) : null;
  const route = choice && transport ? (forItem ? "This item" : routeLabel(transport.settings, choice.city)) : null;
  const taxMode = determineTaxMode(company.stateCode, vendor ?? {});

  const lineInputs: LineInput[] = lines.map((l) => ({
    quantity: num(l.quantity),
    rate: num(l.rate),
    discountPct: num(l.discountPct),
    gstRate: num(l.gstRate),
  }));
  const totals = calcTotals(lineInputs.filter((_, i) => lines[i].itemId), taxMode);

  const vendorOptions = useMemo(
    () =>
      vendors.map((v) => ({
        value: String(v.id),
        label: v.name,
        hint: [v.code, v.city, v.gstin].filter(Boolean).join(" · "),
        keywords: [v.code, v.gstin ?? "", v.city ?? ""],
      })),
    [vendors],
  );
  const itemOptions = useMemo(
    () =>
      items.map((i) => ({
        value: String(i.id),
        label: i.name,
        hint: [i.sku, i.category, i.uom].filter(Boolean).join(" · "),
        keywords: [i.sku, i.category ?? "", i.hsnCode ?? ""],
      })),
    [items],
  );

  const err = (key: string) => errors?.[key]?.[0];

  function selectVendor(value: string) {
    const v = vendors.find((x) => x.id === Number(value));
    setVendorId(v?.id ?? null);
    if (!v) return;
    // The new vendor's transporter, unless one was typed by hand.
    const recommended = !transportTouched && transport ? transportChoices(transport, v, forItem).recommended : null;
    if (recommended) setTransportText(recommended);
    setHeader((h) => ({
      ...h,
      paymentTerms: h.paymentTerms || v.paymentTerms || "",
      expectedDeliveryDate: h.expectedDeliveryDate || (v.leadTimeDays ? addDays(v.leadTimeDays) : ""),
      terms: recommended ? withTransport(h.terms, recommended) : h.terms,
    }));
  }

  function setTransport(name: string) {
    setTransportText(name);
    setTransportTouched(true);
    setHeader((h) => ({ ...h, terms: withTransport(h.terms, name) }));
  }

  function addAddress(address: AddressOption) {
    setAddresses((list) => [...list.filter((a) => a.id !== address.id), address]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function selectItem(key: string, value: string) {
    const item = itemMap.get(Number(value));
    if (!item) return;
    updateLine(key, { itemId: item.id, description: item.name, gstRate: String(item.gstRate), uom: item.uom });
    // An item that always comes one way (e.g. by courier) sets the transport, unless it was typed by hand.
    const always = item.preferredTransport?.trim();
    if (always && !transportTouched) {
      setTransportText(always);
      setHeader((h) => ({ ...h, terms: withTransport(h.terms, always) }));
    }
  }

  function removeLine(key: string) {
    setLines((current) => (current.length === 1 ? [blankLine()] : current.filter((l) => l.key !== key)));
  }

  function save(submit: boolean) {
    setSubmitMode(submit ? "submit" : "draft");
    const filled = lines.filter((l) => l.itemId || l.quantity || l.rate);
    run(
      () =>
        savePurchaseOrder(
          poId ?? null,
          {
            vendorId: vendorId ?? 0,
            ...header,
            items: filled.map((l) => ({
              itemId: l.itemId ?? 0,
              description: l.description,
              quantity: l.quantity,
              rate: l.rate,
              discountPct: l.discountPct || 0,
              gstRate: l.gstRate,
              remarks: l.remarks,
              uom: l.uom || undefined,
            })),
          },
          submit,
        ),
      {
        pending: submit ? "Submitting for approval…" : "Saving…",
        success: submit ? "Submitted for approval" : locked ? "Details saved" : "Draft saved",
        onSuccess: (data) => router.push(`/purchase-orders/${data.id}`),
        onError: (f) => setErrors(f.fieldErrors),
      },
    );
  }

  return (
    <div>
      <div className="min-w-0 space-y-6 pb-6">
        {/* Vendor & order details */}
        <Card>
          <CardHeader>
            <CardTitle>Vendor & order details</CardTitle>
            <CardDescription>Choose the supplier. Tax type is set from their state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset disabled={locked} className="min-w-0">
            <Field data-invalid={!!err("vendorId")}>
              <FieldLabel htmlFor="vendor">
                Vendor<span className="text-destructive">*</span>
              </FieldLabel>
              <Combobox
                id="vendor"
                options={vendorOptions}
                value={vendorId ? String(vendorId) : null}
                onChange={selectVendor}
                placeholder="Search vendors by name, code or GSTIN"
                searchPlaceholder="Search vendors…"
                emptyText="No active vendors found."
                invalid={!!err("vendorId")}
                className="h-10"
              />
              {err("vendorId") && <FieldError>{err("vendorId")}</FieldError>}
            </Field>
            </fieldset>

            {vendor && (
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border">
                    <BuildingIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{vendor.name}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="size-3" />
                        {[vendor.city, stateName(vendor.stateCode)].filter(Boolean).join(", ") || "Location not set"}
                      </span>
                      <span className="font-mono">{vendor.gstin ?? "No GSTIN"}</span>
                      {vendor.email && <span>{vendor.email}</span>}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/5 text-primary">
                  {taxMode === "INTRA_STATE" ? "CGST + SGST" : "IGST"}
                </Badge>
              </div>
            )}

            {vendor && !vendor.stateCode && !vendor.gstin && (
              <Alert>
                <AlertTriangleIcon />
                <AlertDescription>
                  This vendor has no state or GSTIN, so CGST + SGST is assumed. Update the vendor if they&apos;re out of state.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="quotationRef">Quotation ref.</FieldLabel>
                <Input
                  id="quotationRef"
                  value={header.quotationRef}
                  onChange={(e) => setHeader({ ...header, quotationRef: e.target.value })}
                  placeholder="Vendor quote no. (optional)"
                />
              </Field>
              <Field data-invalid={!!err("quotationDate")}>
                <FieldLabel htmlFor="quotationDate">Quotation date</FieldLabel>
                <Input
                  id="quotationDate"
                  type="date"
                  value={header.quotationDate}
                  onChange={(e) => setHeader({ ...header, quotationDate: e.target.value })}
                />
              </Field>
              <Field data-invalid={!!err("expectedDeliveryDate")}>
                <FieldLabel htmlFor="expectedDeliveryDate">Delivery by</FieldLabel>
                <Input
                  id="expectedDeliveryDate"
                  type="date"
                  value={header.expectedDeliveryDate}
                  onChange={(e) => setHeader({ ...header, expectedDeliveryDate: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
                <Input
                  id="paymentTerms"
                  value={header.paymentTerms}
                  onChange={(e) => setHeader({ ...header, paymentTerms: e.target.value })}
                  placeholder="e.g. 30 days"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {locked && (
          <Alert>
            <LockIcon />
            <AlertDescription>
              Vendor, items, quantities and rates come from the approved comparison and can&apos;t be changed here. Add the delivery date and terms, then issue the PO.
            </AlertDescription>
          </Alert>
        )}

        {/* Line items */}
        <fieldset disabled={locked} className="min-w-0">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>Line items</CardTitle>
            <CardDescription>Rates are exclusive of GST.</CardDescription>
          </CardHeader>
          {err("items") && <p className="px-4 pt-3 text-sm text-destructive">{err("items")}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="w-10 py-2.5 pl-4">#</th>
                  <th className="py-2.5 pr-2">Item</th>
                  <th className="w-44 py-2.5 pr-2 text-right">Qty</th>
                  <th className="w-32 py-2.5 pr-2 text-right">Rate (₹)</th>
                  <th className="w-20 py-2.5 pr-2 text-right">Disc %</th>
                  <th className="w-24 py-2.5 pr-2">GST</th>
                  <th className="w-32 py-2.5 pr-2 text-right">Amount</th>
                  <th className="w-10 py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const item = line.itemId ? itemMap.get(line.itemId) : null;
                  const amounts = calcLine(lineInputs[index], taxMode);
                  const prefix = `items.${lines.filter((l) => l.itemId || l.quantity || l.rate).indexOf(line)}`;
                  return (
                    <tr key={line.key} className="border-b align-top last:border-b-0">
                      <td className="py-3 pl-4 text-muted-foreground tabular">{index + 1}</td>
                      <td className="py-2 pr-2">
                        <Combobox
                          options={itemOptions}
                          value={line.itemId ? String(line.itemId) : null}
                          onChange={(v) => selectItem(line.key, v)}
                          placeholder="Select item"
                          searchPlaceholder="Search items…"
                          invalid={!!err(`${prefix}.itemId`)}
                          contentClassName="min-w-96"
                        />
                        {item && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="font-mono">{item.sku}</span>
                            {item.hsnCode && <span>HSN {item.hsnCode}</span>}
                          </div>
                        )}
                        <Input
                          value={line.remarks}
                          onChange={(e) => updateLine(line.key, { remarks: e.target.value })}
                          placeholder="Line note (grade, size, make…)"
                          className="mt-1.5 h-7 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                            aria-invalid={!!err(`${prefix}.quantity`)}
                            className="min-w-0 text-right tabular"
                            placeholder="0"
                          />
                          {item &&
                            (item.unitItem ? (
                              <UnitSelect item={item.unitItem} value={line.uom || item.uom} onChange={(uom) => updateLine(line.key, { uom })} label={`${line.description} unit`} className="w-20 shrink-0" />
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground" title="To order in another unit, add a unit conversion for this item (Items → item → units)">{item.uom}</span>
                            ))}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          inputMode="decimal"
                          value={line.rate}
                          onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                          aria-invalid={!!err(`${prefix}.rate`)}
                          className="text-right tabular"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          inputMode="decimal"
                          value={line.discountPct}
                          onChange={(e) => updateLine(line.key, { discountPct: e.target.value })}
                          className="text-right tabular"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Select value={line.gstRate} onValueChange={(v) => updateLine(line.key, { gstRate: v })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GST_RATES.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 pr-2 text-right tabular">
                        <div className="font-medium">{formatAmount(amounts.total)}</div>
                        {amounts.tax > 0 && (
                          <div className="text-xs text-muted-foreground">incl. {formatAmount(amounts.tax)} GST</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeLine(line.key)}
                              aria-label={`Remove line ${index + 1}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove line</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-6 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, blankLine()])}>
                <PlusIcon />
                Add line
              </Button>
              <span className="text-xs text-muted-foreground">
                {lines.filter((l) => l.itemId).length} of {lines.length} lines filled
              </span>
            </div>
            <dl className="w-full space-y-2 text-sm sm:max-w-80">
              <Row label="Taxable value" value={formatAmount(totals.subtotal)} />
              {totals.slabs.map((s) =>
                taxMode === "INTRA_STATE" ? (
                  <div key={s.gstRate} className="space-y-2">
                    <Row label={`CGST @ ${formatQty(s.gstRate / 2)}%`} value={formatAmount(s.cgst)} />
                    <Row label={`SGST @ ${formatQty(s.gstRate / 2)}%`} value={formatAmount(s.sgst)} />
                  </div>
                ) : (
                  <Row key={s.gstRate} label={`IGST @ ${formatQty(s.gstRate)}%`} value={formatAmount(s.igst)} />
                ),
              )}
              {totals.roundOff !== 0 && <Row label="Round off" value={formatAmount(totals.roundOff)} muted />}
              <Separator />
              <div className="flex items-baseline justify-between pt-1">
                <dt className="font-medium">Grand total</dt>
                <dd className="text-xl font-semibold tracking-tight tabular">{formatINR(totals.grandTotal)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        </fieldset>

        {/* Delivery & terms */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery & terms</CardTitle>
            <CardDescription>Printed on the purchase order sent to the vendor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <AddressPicker
                id="billingAddress"
                label="Billing details"
                value={header.billingAddress}
                onChange={(billingAddress) => setHeader((h) => ({ ...h, billingAddress }))}
                addresses={addresses}
                onAdded={addAddress}
                canSetDefaults={canSetDefaultAddress}
              />
              <AddressPicker
                id="deliveryAddress"
                label="Shipping address"
                value={header.deliveryAddress}
                onChange={(deliveryAddress) => setHeader((h) => ({ ...h, deliveryAddress }))}
                addresses={addresses}
                onAdded={addAddress}
                canSetDefaults={canSetDefaultAddress}
              />
            </div>
            <Field className="md:max-w-xl">
              <FieldLabel htmlFor="transport">Transport</FieldLabel>
              <SuggestInput
                id="transport"
                value={transportText}
                onChange={(e) => setTransport(e.target.value)}
                suggestions={choice?.options ?? []}
                placeholder={choice?.recommended ?? "Transporter or courier, e.g. Thru Your Vehicle"}
                maxLength={100}
              />
              <FieldDescription>
                Goes on the Transport line of the terms below; confirm it with the vendor.
                {choice?.recommended && transportText.trim().toLowerCase() !== choice.recommended.toLowerCase() && (
                  <>
                    {" "}
                    {route ?? "This vendor"}:{" "}
                    <button type="button" onClick={() => setTransport(choice.recommended!)} className="text-primary underline-offset-4 hover:underline">
                      use {choice.recommended}
                    </button>
                  </>
                )}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="terms">Terms & conditions</FieldLabel>
              <Textarea
                id="terms"
                rows={6}
                value={header.terms}
                onChange={(e) => {
                  setHeader({ ...header, terms: e.target.value });
                  setTransportText(termsTransporter(e.target.value) ?? "");
                }}
                className="leading-relaxed"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="internalNotes">Internal notes</FieldLabel>
              <Textarea
                id="internalNotes"
                rows={2}
                value={header.internalNotes}
                onChange={(e) => setHeader({ ...header, internalNotes: e.target.value })}
                placeholder="Visible to your team only, not printed on the PO"
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold tracking-tight tabular">{formatINR(totals.grandTotal)}</span>
            <span className="text-xs text-muted-foreground">
              incl. {formatAmount(totals.cgst + totals.sgst + totals.igst)} GST ·{" "}
              {taxMode === "INTRA_STATE" ? "CGST + SGST" : "IGST"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href={poId ? `/purchase-orders/${poId}` : "/purchase-orders"}>Cancel</Link>
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={pending}>
              {pending && submitMode === "draft" && <Loader2Icon className="animate-spin" />}
              {locked ? "Save details" : "Save as draft"}
            </Button>
            {!locked && (
          <Button onClick={() => save(true)} disabled={pending}>
              {pending && submitMode === "submit" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Submit for approval
            </Button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
