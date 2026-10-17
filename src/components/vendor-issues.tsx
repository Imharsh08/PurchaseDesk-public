"use client";

import { useOptimistic, useState } from "react";
import Link from "@/components/link";
import { CheckCircle2Icon, FlagIcon, Loader2Icon } from "lucide-react";
import { raiseVendorIssue, resolveVendorIssue } from "@/app/(app)/goods-receipts/actions";
import { ReasonDialog } from "@/components/reason-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { IssueType } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { ISSUE_TYPES } from "@/lib/grn-labels";
import { cn } from "@/lib/utils";

const ISSUE_TYPE_LABELS = ISSUE_TYPES;
type IssueTypeKey = IssueType;

export type IssueRow = {
  id: number;
  type: IssueTypeKey;
  status: "OPEN" | "RESOLVED";
  description: string;
  qtyAffected: string | null;
  raisedBy: string;
  raisedAt: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  /** Where it came from, e.g. GRN-2026-0004 / PO-2026-0090 */
  ref?: { label: string; href: string } | null;
  vendor?: { name: string; href: string } | null;
};

export function IssueList({ issues, canResolve, empty = "No issues raised." }: { issues: IssueRow[]; canResolve: boolean; empty?: string }) {
  const [resolving, setResolving] = useState<number | null>(null);
  const [pending, run] = useServerAction();
  // The issue shows as resolved the moment it's saved; the server's copy replaces it when it arrives.
  const [rows, markResolved] = useOptimistic(issues, (current, r: { id: number; resolution: string }) =>
    current.map((i) => (i.id === r.id ? { ...i, status: "RESOLVED" as const, resolution: r.resolution, resolvedBy: "You", resolvedAt: "just now" } : i)),
  );
  if (!rows.length) return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <ul className="divide-y">
        {rows.map((i) => (
          <li key={i.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <FlagIcon className={cn("mt-0.5 size-4 shrink-0", i.status === "OPEN" ? "text-rose-600" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ISSUE_TYPE_LABELS[i.type]}</span>
                <Badge
                  className={cn(
                    "border-transparent",
                    i.status === "OPEN"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                  )}
                >
                  {i.status === "OPEN" ? "Open" : "Resolved"}
                </Badge>
                {i.vendor && (
                  <Link href={i.vendor.href} className="text-muted-foreground hover:text-primary hover:underline">
                    {i.vendor.name}
                  </Link>
                )}
                {i.ref && (
                  <Link href={i.ref.href} className="text-primary hover:underline">
                    {i.ref.label}
                  </Link>
                )}
              </div>
              <p className="mt-0.5 text-muted-foreground">{i.description}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Raised by {i.raisedBy} · {i.raisedAt}
              </p>
              {i.status === "RESOLVED" && i.resolution && (
                <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs">
                  <CheckCircle2Icon className="mr-1 inline size-3.5 text-emerald-600" />
                  {i.resolution} <span className="text-muted-foreground">— {i.resolvedBy}, {i.resolvedAt}</span>
                </p>
              )}
            </div>
            {canResolve && i.status === "OPEN" && (
              <Button variant="outline" size="sm" onClick={() => setResolving(i.id)}>
                Resolve
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ReasonDialog
        open={resolving !== null}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Resolve issue"
        description="Record how it was settled with the vendor. This stays on the vendor's history."
        label="Resolution"
        placeholder="e.g. Vendor replaced 2 bales on 05 Oct; debit note DN-114 for ₹3,200"
        confirmLabel="Mark resolved"
        pending={pending}
        onConfirm={(text) => {
          const id = resolving!;
          setResolving(null);
          run(
            async () => {
              markResolved({ id, resolution: text.trim() });
              return resolveVendorIssue(id, text);
            },
            { success: "Issue resolved", onError: () => setResolving(id) },
          );
        }}
      />
    </>
  );
}

export function RaiseIssueButton({
  vendorId,
  poId,
  grnId,
  items,
  defaultType = "OTHER",
  size = "default",
}: {
  vendorId: number;
  poId?: number;
  grnId?: number;
  items?: { id: number; name: string }[];
  defaultType?: IssueTypeKey;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useServerAction();
  const blank = () => ({ type: defaultType as string, itemId: "", description: "", qtyAffected: "" });
  const [form, setForm] = useState(blank);

  function submit() {
    run(
      () =>
        raiseVendorIssue({
          vendorId,
          poId: poId ?? null,
          grnId: grnId ?? null,
          itemId: form.itemId || null,
          type: form.type as IssueTypeKey,
          description: form.description,
          qtyAffected: form.qtyAffected,
        }),
      {
        pending: "Raising issue…",
        success: "Issue raised",
        onSuccess: () => {
          setOpen(false);
          setForm(blank());
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <FlagIcon />
          Raise issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise an issue with the vendor</DialogTitle>
          <DialogDescription>Tracked on the vendor&apos;s history until resolved (replacement, debit note…).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="issue-type">Type</FieldLabel>
            <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
              <SelectTrigger id="issue-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {items && items.length > 0 ? (
            <Field>
              <FieldLabel htmlFor="issue-item">Item</FieldLabel>
              <Select value={form.itemId || "none"} onValueChange={(v) => setForm({ ...form, itemId: v === "none" ? "" : v })}>
                <SelectTrigger id="issue-item" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole delivery / order</SelectItem>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <div />
          )}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="issue-desc">What happened?</FieldLabel>
            <Textarea
              id="issue-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Invoice rate ₹182/kg vs PO ₹178/kg"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="issue-qty">Quantity affected (optional)</FieldLabel>
            <Input id="issue-qty" inputMode="decimal" value={form.qtyAffected} onChange={(e) => setForm({ ...form, qtyAffected: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || form.description.trim().length < 5}>
            {pending && <Loader2Icon className="animate-spin" />}
            Raise issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
