"use client";

import { useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  DownloadIcon,
  FileCogIcon,
  FilePenLineIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  PackageXIcon,
  PhoneCallIcon,
  TruckIcon,
  PencilIcon,
  SendIcon,
  SendToBackIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/reason-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SuggestInput } from "@/components/suggest-input";
import { useLiveStatus } from "@/components/live-status";
import { useServerAction } from "@/hooks/use-server-action";
import type { POStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  deleteDraftPurchaseOrder,
  emailPurchaseOrder,
  generatePurchaseOrderPdf,
  markPurchaseOrderAcknowledged,
  markDispatched,
  markPurchaseOrderSent,
  recordFollowUp,
  shortClosePurchaseOrder,
  reopenPurchaseOrder,
  rejectPurchaseOrder,
  issuePurchaseOrder,
  submitForApproval,
} from "../actions";

export type POActionProps = {
  po: {
    id: number;
    status: POStatus;
    poNumber: string | null;
    displayNumber: string;
    grandTotal: string;
    poDate: string;
    /** Created from an approved comparative statement: issued without a second approval. */
    linked: boolean;
    /** Closed with the balance not delivered (can be reopened). */
    shortClosed: boolean;
  };
  vendor: { name: string; contactPerson: string | null; email: string | null };
  companyName: string;
  userName: string;
  can: {
    edit: boolean;
    submit: boolean;
    approve: boolean;
    send: boolean;
    cancel: boolean;
    regenerate: boolean;
    receive: boolean;
    amend: boolean;
    /** Close the PO with the balance not delivered (receive doers and managers). */
    shortClose: boolean;
  };
  /** Lines still short (ordered more than received), for the short-close dialog. */
  balance: { description: string; ordered: string; received: string; short: string }[];
  /** A receipt still waits for its check (the PO can't be closed until then). */
  pendingQc: string | null;
  hasPdf: boolean;
  /** The signed-in user has connected their Gmail (POs go out from their address). */
  emailConfigured: boolean;
  connectGmailHref: string;
  /** Vendor already dispatched (bilty recorded). */
  dispatched: boolean;
  /**
   * For the dispatch dialog: the transporter agreed in the PO terms (else the one for the vendor's
   * city), transporters / couriers to pick from, and the route ("Mumbai → MIDC Chakan, Pune").
   */
  transport?: { agreed: string | null; options: string[]; route: string | null };
  /** Vendor confirmation with dispatch date recorded (FMS step 3). */
  confirmed: boolean;
  today: string;
  /** Opened from the FMS sheet: the step to start on, and where to go after saving. */
  startWith?: string | null;
  returnTo?: string | null;
};

type Dialogs = "approve" | "issue" | "reject" | "cancel" | "delete" | "email" | "manual" | "shortClose" | "reopen" | "ack" | "followUp" | "dispatch" | null;

/** The dialog for an FMS step, if that step can be done now by this user. */
function initialDialog({ startWith, po, can, dispatched, confirmed }: POActionProps): Dialogs {
  switch (startWith) {
    case "issue":
      return po.status === "DRAFT" && po.linked && can.submit ? "issue" : null;
    case "approve":
      return po.status === "PENDING_APPROVAL" && can.approve ? "approve" : null;
    case "send":
      return po.status === "APPROVED" && can.send ? "email" : null;
    case "ack":
      return ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(po.status) && can.send && !confirmed ? "ack" : null;
    case "dispatch":
      return ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(po.status) && can.send && !dispatched ? "dispatch" : null;
    case "shortclose":
      return po.status === "PARTIALLY_RECEIVED" && can.shortClose ? "shortClose" : null;
    default:
      return null;
  }
}

const splitEmails = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function POActions(props: POActionProps) {
  const { po, can } = props;
  // Switches to the expected status the moment an action is confirmed.
  const live = useLiveStatus(po.status);
  const status = live.status;
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>(() => initialDialog(props));
  const [pending, runAction] = useServerAction();
  const [ackDate, setAckDate] = useState("");
  const [dispatch, setDispatch] = useState({ dispatchedOn: props.today, biltyNo: "", transporter: props.transport?.agreed ?? "", note: "" });

  /** Runs a PO action: "working" toast at once, then the dialog closes as the refreshed PO appears. */
  function run<T>(
    action: () => Promise<ActionResult<T>>,
    working: string,
    success: string,
    { next, onDone }: { next?: POStatus; onDone?: (data: T) => void } = {},
  ) {
    runAction(action, {
      pending: working,
      success,
      optimistic: next ? () => live.set(next) : undefined,
      onSuccess: (data) => {
        setDialog(null);
        onDone?.(data);
        if (props.returnTo) router.push(props.returnTo);
      },
    });
  }

  const pdfHref = `/api/purchase-orders/${po.id}/pdf`;
  const isIssued = !!po.poNumber;
  const closed = status === "CANCELLED" || status === "COMPLETED";
  const cancellable = can.cancel && ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED"].includes(status);

  const menu = {
    download: isIssued,
    regenerate: isIssued && can.regenerate && !closed,
    delete: status === "DRAFT" && can.edit && !po.linked,
    cancel: cancellable && (status !== "DRAFT" || po.linked),
    reopen: can.cancel && status === "COMPLETED" && po.shortClosed,
  };
  const hasMenu = Object.values(menu).some(Boolean) || can.amend;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" && can.edit && (
          <Button variant="outline" asChild>
            <Link href={`/purchase-orders/${po.id}/edit`}>
              <PencilIcon />
              {po.linked ? "Edit details" : "Edit"}
            </Link>
          </Button>
        )}
        {status === "DRAFT" && po.linked && can.submit && (
          <Button onClick={() => setDialog("issue")} disabled={pending}>
            <SendIcon />
            Issue PO
          </Button>
        )}
        {status === "DRAFT" && !po.linked && can.submit && (
          <Button onClick={() => run(() => submitForApproval(po.id), "Submitting for approval…", "Submitted for approval", { next: "PENDING_APPROVAL" })} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Submit for approval
          </Button>
        )}

        {status === "PENDING_APPROVAL" && can.approve && (
          <>
            <Button variant="outline" onClick={() => setDialog("reject")} disabled={pending}>
              <UndoIcon />
              Send back
            </Button>
            <Button onClick={() => setDialog("approve")} disabled={pending}>
              <CheckIcon />
              Approve & issue
            </Button>
          </>
        )}

        {status === "APPROVED" && can.send && (
          <>
            <Button variant="outline" onClick={() => setDialog("manual")} disabled={pending}>
              <SendToBackIcon />
              Mark as sent
            </Button>
            <Button onClick={() => setDialog("email")} disabled={pending}>
              <MailIcon />
              Email to vendor
            </Button>
          </>
        )}

        {status === "SENT" && can.send && (
          <>
            <Button variant="outline" onClick={() => setDialog("email")} disabled={pending}>
              <MailIcon />
              Resend
            </Button>
            <Button onClick={() => setDialog("ack")} disabled={pending}>
              <CheckCheckIcon />
              Vendor confirmed
            </Button>
          </>
        )}

        {status === "ACKNOWLEDGED" && can.send && (
          <Button variant="outline" onClick={() => setDialog("email")} disabled={pending}>
            <MailIcon />
            Resend
          </Button>
        )}

        {["ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(status) && can.send && !props.confirmed && (
          <Button variant="outline" onClick={() => setDialog("ack")} disabled={pending}>
            <CheckCheckIcon />
            Record lead time
          </Button>
        )}

        {can.send && ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(status) && !props.dispatched && (
          <>
            <Button variant="outline" onClick={() => setDialog("followUp")} disabled={pending}>
              <PhoneCallIcon />
              Follow up
            </Button>
            <Button variant="outline" onClick={() => setDialog("dispatch")} disabled={pending}>
              <TruckIcon />
              Dispatched
            </Button>
          </>
        )}

        {can.receive && ["APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(status) && (
          <Button variant={status === "APPROVED" ? "outline" : "default"} asChild>
            <Link href={`/goods-receipts/new?po=${po.id}`}>
              <PackageCheckIcon />
              Receive material
            </Link>
          </Button>
        )}

        {/* The vendor won't send the rest: close with the short quantity (right here, not in the menu). */}
        {status === "PARTIALLY_RECEIVED" && can.shortClose && (
          <Button variant="outline" onClick={() => setDialog("shortClose")} disabled={pending}>
            <PackageXIcon />
            Short close
          </Button>
        )}

        {isIssued && (
          <Button variant="outline" asChild>
            <a href={pdfHref} target="_blank" rel="noopener">
              <DownloadIcon />
              PDF
            </a>
          </Button>
        )}

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {menu.download && (
                <DropdownMenuItem asChild>
                  <a href={`${pdfHref}?download=1`}>
                    <DownloadIcon />
                    Download PDF
                  </a>
                </DropdownMenuItem>
              )}
              {menu.regenerate && (
                <DropdownMenuItem
                  onSelect={() =>
                    run(() => generatePurchaseOrderPdf(po.id), "Generating PDF…", props.hasPdf ? "PDF regenerated" : "PDF generated")
                  }
                >
                  <FileCogIcon />
                  {props.hasPdf ? "Regenerate PDF" : "Generate PDF"}
                </DropdownMenuItem>
              )}
              {(menu.delete || menu.cancel || menu.reopen || can.amend) && (menu.download || menu.regenerate) && <DropdownMenuSeparator />}
              {can.amend && (
                <DropdownMenuItem asChild>
                  <Link href={`/purchase-orders/${po.id}/amend`}>
                    <FilePenLineIcon />
                    Amend PO
                  </Link>
                </DropdownMenuItem>
              )}
              {menu.reopen && (
                <DropdownMenuItem onSelect={() => setDialog("reopen")}>
                  <PackageOpenIcon />
                  Reopen to receive the balance
                </DropdownMenuItem>
              )}
              {menu.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2Icon />
                  Delete draft
                </DropdownMenuItem>
              )}
              {menu.cancel && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
                  <BanIcon />
                  Cancel PO
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Issue (vendor already approved on the comparative statement) */}
      <AlertDialog open={dialog === "issue"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue this PO to {props.vendor.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The vendor and rates were approved on the comparative statement. A PO number will be assigned and the PDF
              generated ({po.grandTotal}). Check the delivery date and terms first; they can&apos;t be changed after issue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run(() => issuePurchaseOrder(po.id), "Issuing PO and generating PDF…", "Purchase order issued", { next: "APPROVED", onDone: (data) => {
                  if (data.pdfError) toast.warning(data.pdfError);
                  else toast.message(`Issued as ${data.poNumber}`);
                } });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Issue PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve */}
      <AlertDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve and issue this PO?</AlertDialogTitle>
            <AlertDialogDescription>
              A PO number will be assigned and the final PDF generated for <strong>{props.vendor.name}</strong> (
              {po.grandTotal}). The PO can no longer be edited after this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run(() => approvePurchaseOrder(po.id), "Approving and generating PDF…", "Purchase order approved", { next: "APPROVED", onDone: (data) => {
                  if (data.pdfError) toast.warning(data.pdfError);
                  else toast.message(`Issued as ${data.poNumber}`);
                } });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Approve & issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft */}
      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {po.displayNumber} and its line items will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteDraftPurchaseOrder(po.id), "Deleting draft…", "Draft deleted", { onDone: () => router.push("/purchase-orders") });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Send back for changes"
        description="The PO returns to draft so the creator can fix it. Your note is shown to them."
        label="What needs to change?"
        placeholder="e.g. Rate for line 2 is higher than the last PO; please re-check with vendor."
        confirmLabel="Send back"
        pending={pending}
        onConfirm={(reason) => run(() => rejectPurchaseOrder(po.id, reason), "Sending back…", "Sent back to draft", { next: "DRAFT" })}
      />

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Cancel ${po.displayNumber}?`}
        description={
          status === "SENT" || status === "ACKNOWLEDGED"
            ? "The vendor already has this PO, so remember to tell them it's cancelled."
            : "The PO will be closed and kept for records."
        }
        label="Reason for cancelling"
        confirmLabel="Cancel PO"
        destructive
        pending={pending}
        onConfirm={(reason) => run(() => cancelPurchaseOrder(po.id, reason), "Cancelling PO…", "Purchase order cancelled", { next: "CANCELLED" })}
      />

      <ReasonDialog
        open={dialog === "shortClose"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Short close ${po.displayNumber}?`}
        description="The balance below won't be delivered: the PO is closed and it stops counting as on order. What was received stays as recorded, and a manager can reopen the PO if the rest comes after all."
        label="Why is the balance not coming?"
        placeholder="e.g. Vendor discontinued grade; balance 50 Kg ordered from another vendor"
        suggestions={["Vendor can't supply the balance", "Balance not needed any more", "Ordered the balance from another vendor", "Received in full, the rest is extra"]}
        confirmLabel="Short close"
        pending={pending}
        onConfirm={(reason) => run(() => shortClosePurchaseOrder(po.id, reason), "Closing PO…", "PO short closed", { next: "COMPLETED" })}
      >
        {props.pendingQc && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {props.pendingQc} still waits for its check. Finish the check first, so the accepted quantity is known.
          </p>
        )}
        {props.balance.length > 0 && (
          <div className="overflow-hidden rounded-md border text-sm">
            <table className="w-full">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Item</th>
                  <th className="px-3 py-1.5 text-right font-medium">Ordered</th>
                  <th className="px-3 py-1.5 text-right font-medium">Received</th>
                  <th className="px-3 py-1.5 text-right font-medium">Short</th>
                </tr>
              </thead>
              <tbody>
                {props.balance.map((b, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{b.description}</td>
                    <td className="px-3 py-1.5 text-right tabular">{b.ordered}</td>
                    <td className="px-3 py-1.5 text-right tabular">{b.received}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-rose-700 tabular dark:text-rose-400">{b.short}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "reopen"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reopen ${po.displayNumber}?`}
        description="The balance quantity counts as on order again and can be received against this PO."
        label="Why is it being reopened?"
        placeholder="e.g. Closed while importing the FMS sheet; balance 11 Bale arrived"
        confirmLabel="Reopen"
        pending={pending}
        onConfirm={(reason) => run(() => reopenPurchaseOrder(po.id, reason), "Reopening PO…", "PO reopened", { next: "PARTIALLY_RECEIVED" })}
      />

      <ReasonDialog
        open={dialog === "followUp"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Follow up with vendor"
        description="Record the follow-up done before the dispatch date (FMS step 4)."
        label="What did the vendor say?"
        placeholder="e.g. Spoke to Rajesh: material ready, dispatch on 12 Oct via VRL"
        confirmLabel="Save follow-up"
        pending={pending}
        onConfirm={(note) => run(() => recordFollowUp(po.id, note), "Saving follow-up…", "Follow-up recorded")}
      />

      <Dialog open={dialog === "ack"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vendor confirmed the PO</DialogTitle>
            <DialogDescription>Enter the dispatch date the vendor committed to (lead time). Follow-up is due 2 days before it.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="ack-date">Expected dispatch date</FieldLabel>
            <Input id="ack-date" type="date" value={ackDate} onChange={(e) => setAckDate(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending || !ackDate} onClick={() => run(() => markPurchaseOrderAcknowledged(po.id, ackDate), "Saving confirmation…", "Vendor confirmation recorded", { next: status === "SENT" ? "ACKNOWLEDGED" : status })}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "dispatch"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Material dispatched</DialogTitle>
            <DialogDescription>Take the bilty / LR details from the vendor. They are filled in automatically when the material is received.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dp-date">Dispatched on</FieldLabel>
              <Input id="dp-date" type="date" value={dispatch.dispatchedOn} onChange={(e) => setDispatch({ ...dispatch, dispatchedOn: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dp-lr">Bilty / LR no.</FieldLabel>
              <Input id="dp-lr" value={dispatch.biltyNo} onChange={(e) => setDispatch({ ...dispatch, biltyNo: e.target.value })} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="dp-tr">Transporter / courier</FieldLabel>
              <SuggestInput
                id="dp-tr"
                value={dispatch.transporter}
                onChange={(e) => setDispatch({ ...dispatch, transporter: e.target.value })}
                suggestions={props.transport?.options ?? []}
                placeholder="e.g. Vijay Lakshmi Transport, DTDC courier"
                maxLength={100}
              />
              <FieldDescription>
                {props.transport?.route ? `${props.transport.route}. ` : ""}
                Pick one, or type the transporter or courier the vendor used: it is suggested for this city next time.
              </FieldDescription>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="dp-note">Note</FieldLabel>
              <Input id="dp-note" value={dispatch.note} onChange={(e) => setDispatch({ ...dispatch, note: e.target.value })} placeholder="e.g. 40 bales, expected in 3 days" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending || !dispatch.biltyNo.trim() || !dispatch.dispatchedOn} onClick={() => run(() => markDispatched(po.id, dispatch), "Saving dispatch…", "Dispatch recorded")}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={dialog === "manual"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark as sent"
        description="Use this when the PO reached the vendor another way. Download the PDF to share it."
        label="How was it sent?"
        placeholder="e.g. WhatsApp to Rajesh (+91 98xxx xxxxx)"
        confirmLabel="Mark as sent"
        minLength={2}
        pending={pending}
        onConfirm={(note) => run(() => markPurchaseOrderSent(po.id, note), "Marking as sent…", "Marked as sent", { next: "SENT" })}
      />

      <EmailDialog
        {...props}
        open={dialog === "email"}
        onOpenChange={(o) => !o && setDialog(null)}
        pending={pending}
        onSend={(input) => run(() => emailPurchaseOrder(po.id, input), "Sending email…", `Emailed to ${input.to.join(", ")}`, { next: status === "APPROVED" ? "SENT" : status })}
      />
    </>
  );
}

function EmailDialog({
  po,
  vendor,
  companyName,
  userName,
  emailConfigured,
  connectGmailHref,
  open,
  onOpenChange,
  pending,
  onSend,
}: POActionProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSend: (input: { to: string[]; cc: string[]; subject: string; message: string }) => void;
}) {
  const greeting = vendor.contactPerson ?? vendor.name;
  const defaults = () => ({
    to: vendor.email ?? "",
    cc: "",
    subject: `Purchase Order ${po.poNumber} from ${companyName}`,
    message:
      `Dear ${greeting},\n\n` +
      `Please find attached our Purchase Order ${po.poNumber} dated ${po.poDate} for ${po.grandTotal}.\n\n` +
      `Kindly acknowledge receipt and confirm the delivery schedule. Please quote the PO number on your invoice and delivery challan.\n\n` +
      `Regards,\n${userName}\n${companyName}`,
  });
  const [form, setForm] = useState(defaults);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setForm(defaults());
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {po.poNumber} to vendor</DialogTitle>
          <DialogDescription>Sent from your own email address with the approved PDF attached; it appears in your Gmail Sent folder.</DialogDescription>
        </DialogHeader>
        {!emailConfigured && (
          <Alert>
            <MailIcon />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              Connect your Gmail once so POs go out from your address.
              <Button size="sm" asChild>
                <a href={connectGmailHref}>Connect Gmail</a>
              </Button>
              <span className="text-xs">Or close this and use “Mark as sent”.</span>
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="email-to">To</FieldLabel>
            <Input id="email-to" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="vendor@example.com" />
            {!vendor.email && <FieldDescription>No email saved for this vendor. Add it on the vendor record for next time.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="email-cc">CC</FieldLabel>
            <Input id="email-cc" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} placeholder="Separate multiple addresses with commas" />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
            <Input id="email-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-message">Message</FieldLabel>
            <Textarea id="email-message" rows={9} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !emailConfigured || !splitEmails(form.to).length}
            onClick={() =>
              onSend({ to: splitEmails(form.to), cc: splitEmails(form.cc), subject: form.subject, message: form.message })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
