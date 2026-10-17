"use client";

import { useState } from "react";
import { CheckIcon, ClipboardCheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLiveStatus } from "@/components/live-status";
import type { GrnStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cleanNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { submitQualityCheck } from "../actions";

export type QcLine = {
  id: number;
  description: string;
  sku: string;
  uom: string;
  invoiceQty: number | null;
  receivedQty: number;
};

type Result = "PASS" | "FAIL";
type Entry = { qtyCheck: Result; qualityCheck: Result; acceptedQty: string; remarks: string };

export function QcForm({ grnId, lines, returnTo }: { grnId: number; lines: QcLine[]; returnTo?: string | null }) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const live = useLiveStatus<GrnStatus>("PENDING_QC");
  const [remarks, setRemarks] = useState("");
  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          // Quantity check defaults to Fail when the gate count differs from the invoice
          qtyCheck: l.invoiceQty !== null && l.invoiceQty !== l.receivedQty ? "FAIL" : "PASS",
          qualityCheck: "PASS",
          acceptedQty: String(l.receivedQty),
          remarks: "",
        },
      ]),
    ),
  );
  const set = (id: number, patch: Partial<Entry>) => setEntries((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));

  const problems = lines.flatMap((l) => {
    const e = entries[l.id];
    const accepted = Number(cleanNumber(e.acceptedQty));
    if (e.acceptedQty.trim() === "" || !Number.isFinite(accepted) || accepted < 0) return [`${l.description}: enter the accepted qty`];
    if (accepted > l.receivedQty) return [`${l.description}: accepted is more than received`];
    if (accepted < l.receivedQty && e.qualityCheck === "PASS") return [`${l.description}: mark quality as Fail when rejecting`];
    return [];
  });

  function submit() {
    if (problems.length) return void toast.error(problems[0]);
    run(() => submitQualityCheck(grnId, { remarks, items: lines.map((l) => ({ id: l.id, ...entries[l.id] })) }), {
      pending: "Saving check and updating stock…",
      optimistic: () => live.set("COMPLETED"),
      success: "Check saved and accepted quantity added to stock",
      onSuccess: (data) => {
        if (data.issues) toast.warning(`${data.issues} issue${data.issues === 1 ? "" : "s"} raised against the vendor`);
        if (returnTo) router.push(returnTo);
      },
    });
  }

  return (
    <Card id="qc" className="scroll-mt-20 gap-0 py-0 ring-amber-400/60">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheckIcon className="size-4 text-amber-600" />
          Quantity & quality check
        </CardTitle>
        <CardDescription>
          Pass or fail each item. Accepted quantity goes into stock and counts as received on the PO; failures are raised as vendor issues.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <th className="py-2.5 pl-4">Item</th>
              <th className="py-2.5 pr-3 text-right">Invoice qty</th>
              <th className="py-2.5 pr-3 text-right">Received</th>
              <th className="py-2.5 pr-3">Quantity</th>
              <th className="py-2.5 pr-3">Quality</th>
              <th className="w-40 py-2.5 pr-3">Accepted</th>
              <th className="py-2.5 pr-4">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const e = entries[l.id];
              const accepted = Number(cleanNumber(e.acceptedQty));
              const rejected = Number.isFinite(accepted) ? Math.max(0, l.receivedQty - accepted) : 0;
              return (
                <tr key={l.id} className={cn("border-b align-top last:border-b-0", (e.qtyCheck === "FAIL" || e.qualityCheck === "FAIL") && "bg-rose-50/60 dark:bg-rose-950/20")}>
                  <td className="py-3 pl-4">
                    <div className="font-medium">{l.description}</div>
                    <div className="text-xs text-muted-foreground">{l.sku}</div>
                  </td>
                  <td className="py-3 pr-3 text-right tabular">{l.invoiceQty === null ? "—" : formatQty(l.invoiceQty)}</td>
                  <td className="py-3 pr-3 text-right font-medium tabular">
                    {formatQty(l.receivedQty)} <span className="font-normal text-muted-foreground">{l.uom}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <PassFail value={e.qtyCheck} onChange={(v) => set(l.id, { qtyCheck: v })} label={`${l.description} quantity check`} />
                  </td>
                  <td className="py-2 pr-3">
                    <PassFail
                      value={e.qualityCheck}
                      onChange={(v) => set(l.id, { qualityCheck: v, ...(v === "FAIL" && accepted === l.receivedQty ? { acceptedQty: "0" } : {}), ...(v === "PASS" ? { acceptedQty: String(l.receivedQty) } : {}) })}
                      label={`${l.description} quality check`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <InputGroup>
                      <InputGroupInput
                        inputMode="decimal"
                        value={e.acceptedQty}
                        onChange={(ev) => set(l.id, { acceptedQty: ev.target.value })}
                        className="text-right tabular"
                        aria-label={`${l.description} accepted quantity`}
                      />
                      <InputGroupAddon align="inline-end">{l.uom}</InputGroupAddon>
                    </InputGroup>
                    {rejected > 0 && <div className="mt-1 text-right text-xs text-rose-600">{formatQty(rejected)} rejected</div>}
                  </td>
                  <td className="py-2 pr-4">
                    <Input
                      value={e.remarks}
                      onChange={(ev) => set(l.id, { remarks: ev.target.value })}
                      placeholder={e.qualityCheck === "FAIL" ? "Why rejected? e.g. hardness 68 vs 60±5" : "Optional"}
                      aria-label={`${l.description} remarks`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Overall remarks (optional), e.g. Test certificate checked" className="sm:max-w-md" aria-label="Overall remarks" />
        <Button className="sm:ml-auto" onClick={submit} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <ClipboardCheckIcon />}
          Save check & update stock
        </Button>
      </div>
    </Card>
  );
}

function PassFail({ value, onChange, label }: { value: Result; onChange: (v: Result) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border p-0.5">
      {(["PASS", "FAIL"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === v
              ? v === "PASS"
                ? "bg-emerald-600 text-white"
                : "bg-rose-600 text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {v === "PASS" ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
          {v === "PASS" ? "Pass" : "Fail"}
        </button>
      ))}
    </div>
  );
}
