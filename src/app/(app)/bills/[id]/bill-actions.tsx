"use client";

import { useState } from "react";
import Link from "@/components/link";
import { BanIcon, CheckIcon, IndianRupeeIcon, Loader2Icon, PauseIcon, PencilIcon, PrinterIcon } from "lucide-react";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLiveStatus } from "@/components/live-status";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/lib/action";
import { PAYMENT_MODES } from "@/lib/validation";
import { cancelBill, holdBill, passBill, recordPayment } from "../actions";

export function BillActions({
  bill,
  can,
}: {
  bill: { id: number; grnId: number; status: string; billNumber: string; outstanding: number; hasDebitNote: boolean; today: string };
  can: { edit: boolean; pass: boolean; pay: boolean };
}) {
  const [pending, runAction] = useServerAction();
  // Switches to the expected status the moment an action is confirmed.
  const live = useLiveStatus(bill.status);
  const status = live.status;
  const [dialog, setDialog] = useState<"hold" | "cancel" | "pay" | null>(null);
  const [pay, setPay] = useState({ amount: String(bill.outstanding), paidOn: bill.today, mode: "NEFT", reference: "", note: "" });

  function run<T>(fn: () => Promise<ActionResult<T>>, working: string, ok: string, next?: string) {
    runAction(fn, { pending: working, success: ok, onSuccess: () => setDialog(null), optimistic: next ? () => live.set(next) : undefined });
  }

  const open = status === "ENTERED" || status === "HOLD";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {bill.hasDebitNote && (
          <Button variant="outline" asChild>
            <Link href={`/debit-note/${bill.id}`} target="_blank">
              <PrinterIcon />
              Debit note
            </Link>
          </Button>
        )}
        {open && can.edit && (
          <Button variant="outline" asChild>
            <Link href={`/bills/new?grn=${bill.grnId}`}>
              <PencilIcon />
              Edit
            </Link>
          </Button>
        )}
        {open && can.pass && (
          <>
            {status === "ENTERED" && (
              <Button variant="outline" onClick={() => setDialog("hold")} disabled={pending}>
                <PauseIcon />
                Hold
              </Button>
            )}
            <Button variant="outline" className="text-destructive" onClick={() => setDialog("cancel")} disabled={pending}>
              <BanIcon />
              Cancel
            </Button>
            <Button onClick={() => run(() => passBill(bill.id), "Passing bill…", "Bill passed for payment", "PASSED")} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Pass for payment
            </Button>
          </>
        )}
        {status === "PASSED" && bill.outstanding > 0 && can.pay && (
          <Button onClick={() => setDialog("pay")}>
            <IndianRupeeIcon />
            Record payment
          </Button>
        )}
      </div>

      <ReasonDialog
        open={dialog === "hold"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Put bill on hold"
        description="Payment is stopped until the bill is passed. Say what is pending (e.g. credit note, replacement)."
        label="Reason"
        confirmLabel="Hold"
        pending={pending}
        onConfirm={(reason) => run(() => holdBill(bill.id, reason), "Putting on hold…", "Bill on hold", "HOLD")}
      />
      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Cancel ${bill.billNumber}?`}
        description="Use when the vendor sends a corrected invoice. The receipt becomes free to enter the new bill."
        label="Reason"
        confirmLabel="Cancel bill"
        destructive
        pending={pending}
        onConfirm={(reason) => run(() => cancelBill(bill.id, reason), "Cancelling bill…", "Bill cancelled", "CANCELLED")}
      />
      <Dialog open={dialog === "pay"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Against {bill.billNumber}. Part payments are allowed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="p-amt">Amount (₹)</FieldLabel>
              <Input id="p-amt" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="tabular" />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-date">Paid on</FieldLabel>
              <Input id="p-date" type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-mode">Mode</FieldLabel>
              <Select value={pay.mode} onValueChange={(mode) => setPay({ ...pay, mode })}>
                <SelectTrigger id="p-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === "CHEQUE" ? "Cheque" : m === "CASH" ? "Cash" : m === "OTHER" ? "Other" : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="p-ref">UTR / cheque no.</FieldLabel>
              <Input id="p-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="p-note">Note</FieldLabel>
              <Input id="p-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => run(() => recordPayment(bill.id, { ...pay, mode: pay.mode as (typeof PAYMENT_MODES)[number] }), "Saving payment…", "Payment recorded")}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
