"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { FilePenLineIcon, Loader2Icon } from "lucide-react";
import { AddressPicker } from "@/components/address-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import type { AddressOption } from "@/lib/addresses";
import { formatAmount, formatINR, formatQty, toNumber } from "@/lib/format";
import { calcTotals, type TaxMode } from "@/lib/po-calc";
import { cn } from "@/lib/utils";
import { requestAmendment } from "../../actions";

export type AmendLine = {
  poItemId: number;
  lineNo: number;
  description: string;
  sku: string;
  uom: string;
  quantity: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  received: number;
};

type Row = { quantity: string; rate: string; discountPct: string; gstRate: string; remove: boolean };

export function AmendForm({
  poId,
  taxMode,
  oldTotal,
  lines,
  header,
  addresses: savedAddresses,
  canSetDefaultAddress,
}: {
  poId: number;
  taxMode: TaxMode;
  oldTotal: number;
  lines: AmendLine[];
  header: { expectedDeliveryDate: string; paymentTerms: string; billingAddress: string; deliveryAddress: string; terms: string };
  addresses: AddressOption[];
  canSetDefaultAddress: boolean;
}) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [addresses, setAddresses] = useState(savedAddresses);
  const addAddress = (address: AddressOption) => setAddresses((list) => [...list.filter((a) => a.id !== address.id), address]);
  const [rows, setRows] = useState<Record<number, Row>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.poItemId,
        { quantity: String(l.quantity), rate: String(l.rate), discountPct: String(l.discountPct), gstRate: String(l.gstRate), remove: false },
      ]),
    ),
  );
  const [head, setHead] = useState(header);
  const [reason, setReason] = useState("");
  const set = (id: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const newTotal = useMemo(() => {
    const kept = lines
      .filter((l) => !rows[l.poItemId].remove)
      .map((l) => {
        const r = rows[l.poItemId];
        return { quantity: toNumber(r.quantity), rate: toNumber(r.rate), discountPct: toNumber(r.discountPct), gstRate: toNumber(r.gstRate) };
      });
    return calcTotals(kept, taxMode).grandTotal;
  }, [lines, rows, taxMode]);
  const diff = newTotal - oldTotal;

  function submit() {
    run(
      () =>
        requestAmendment(poId, {
          reason,
          header: head,
          lines: lines.map((l) => ({ poItemId: l.poItemId, ...rows[l.poItemId] })),
        }),
      {
        pending: "Sending amendment for approval…",
        success: (data) => `Amendment Rev. ${data.revisionNo} sent for approval`,
        onSuccess: () => router.push(`/purchase-orders/${poId}`),
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Lines</CardTitle>
          <CardDescription>Change quantity, rate, discount or GST. Quantity can&apos;t go below what is already received; lines with receipts can&apos;t be removed.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="py-2.5 pl-4">Item</th>
                <th className="py-2.5 pr-3 text-right">Received</th>
                <th className="w-32 py-2.5 pr-3">Qty</th>
                <th className="w-32 py-2.5 pr-3">Rate (₹)</th>
                <th className="w-24 py-2.5 pr-3">Disc. %</th>
                <th className="w-24 py-2.5 pr-3">GST %</th>
                <th className="py-2.5 pr-4 text-center">Remove</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const r = rows[l.poItemId];
                const changed =
                  toNumber(r.quantity) !== l.quantity || toNumber(r.rate) !== l.rate || toNumber(r.discountPct) !== l.discountPct || toNumber(r.gstRate) !== l.gstRate;
                return (
                  <tr key={l.poItemId} className={cn("border-b align-top last:border-b-0", r.remove && "opacity-50", changed && !r.remove && "bg-amber-50/60 dark:bg-amber-950/20")}>
                    <td className="py-3 pl-4">
                      <div className="font-medium">
                        {l.lineNo}. {l.description}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.sku} · was {formatQty(l.quantity)} {l.uom} @ ₹{formatAmount(l.rate)}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular">{formatQty(l.received)}</td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={r.quantity} disabled={r.remove} onChange={(e) => set(l.poItemId, { quantity: e.target.value })} className="text-right tabular" aria-label={`${l.description} quantity`} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={r.rate} disabled={r.remove} onChange={(e) => set(l.poItemId, { rate: e.target.value })} className="text-right tabular" aria-label={`${l.description} rate`} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={r.discountPct} disabled={r.remove} onChange={(e) => set(l.poItemId, { discountPct: e.target.value })} className="text-right tabular" aria-label={`${l.description} discount`} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" value={r.gstRate} disabled={r.remove} onChange={(e) => set(l.poItemId, { gstRate: e.target.value })} className="text-right tabular" aria-label={`${l.description} GST`} />
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <Checkbox
                        checked={r.remove}
                        disabled={l.received > 0}
                        onCheckedChange={(v) => set(l.poItemId, { remove: v === true })}
                        aria-label={`Remove ${l.description}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Current total <span className="font-medium text-foreground tabular">{formatINR(oldTotal)}</span>
          </span>
          <span>
            Revised total <span className="text-lg font-semibold tabular">{formatINR(newTotal)}</span>
            {diff !== 0 && (
              <span className={cn("ml-2 text-xs tabular", diff > 0 ? "text-rose-600" : "text-emerald-600")}>
                {diff > 0 ? "+" : "−"}
                {formatINR(Math.abs(diff))}
              </span>
            )}
          </span>
        </div>
      </Card>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="am-date">Delivery by</FieldLabel>
            <Input id="am-date" type="date" value={head.expectedDeliveryDate} onChange={(e) => setHead({ ...head, expectedDeliveryDate: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="am-pay">Payment terms</FieldLabel>
            <Input id="am-pay" value={head.paymentTerms} onChange={(e) => setHead({ ...head, paymentTerms: e.target.value })} />
          </Field>
          <AddressPicker
            id="am-bill"
            label="Billing details"
            value={head.billingAddress}
            onChange={(billingAddress) => setHead((h) => ({ ...h, billingAddress }))}
            addresses={addresses}
            onAdded={addAddress}
            canSetDefaults={canSetDefaultAddress}
          />
          <AddressPicker
            id="am-ship"
            label="Shipping address"
            value={head.deliveryAddress}
            onChange={(deliveryAddress) => setHead((h) => ({ ...h, deliveryAddress }))}
            addresses={addresses}
            onAdded={addAddress}
            canSetDefaults={canSetDefaultAddress}
          />
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="am-terms">Terms & conditions</FieldLabel>
            <Textarea id="am-terms" rows={5} value={head.terms} onChange={(e) => setHead({ ...head, terms: e.target.value })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="am-reason">
              Reason for amendment<span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="am-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Vendor revised rate after natural rubber price increase; quantity reduced as per revised production plan"
            />
            <FieldDescription>The approver sees this with the list of changes. The revised PO is numbered Rev. N and has to be sent to the vendor again.</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/purchase-orders/${poId}`}>Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={pending || reason.trim().length < 5}>
          {pending ? <Loader2Icon className="animate-spin" /> : <FilePenLineIcon />}
          Send amendment for approval
        </Button>
      </div>
    </div>
  );
}
