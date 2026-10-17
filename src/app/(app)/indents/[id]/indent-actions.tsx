"use client";

import { useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { BanIcon, CheckIcon, FilePlus2Icon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, SendIcon, UndoIcon } from "lucide-react";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IndentStatus } from "@/generated/prisma/enums";
import { useLiveStatus } from "@/components/live-status";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/lib/action";
import { approveComparison, cancelIndent, createPurchaseOrders, rejectComparison, submitIndent } from "../actions";

export type IndentActionProps = {
  indent: { id: number; status: IndentStatus; indentNumber: string; vendorCount: number };
  can: { edit: boolean; addQuote: boolean; approve: boolean; createPOs: boolean; cancel: boolean };
  /** Opened from the FMS sheet: go back there after approving. */
  returnTo?: string | null;
};

type Dialog = "approve" | "reject" | "cancel" | null;

export function IndentActions({ indent, can, returnTo }: IndentActionProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, runAction] = useServerAction();
  // Switches to the expected status the moment an action is confirmed.
  const live = useLiveStatus(indent.status);
  const status = live.status;

  function run<T>(action: () => Promise<ActionResult<T>>, working: string, success: string, done?: (data: T) => void, next?: IndentStatus) {
    runAction(action, {
      pending: working,
      success,
      optimistic: next ? () => live.set(next) : undefined,
      onSuccess: (data) => {
        setDialog(null);
        done?.(data);
      },
    });
  }

  const cancellable = can.cancel && ["DRAFT", "OPEN", "PENDING_APPROVAL", "APPROVED"].includes(status);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" && can.edit && (
          <>
            <Button variant="outline" asChild>
              <Link href={`/indents/${indent.id}/edit`}>
                <PencilIcon />
                Edit
              </Link>
            </Button>
            <Button onClick={() => run(() => submitIndent(indent.id), "Sending to purchase…", "Indent sent to purchase", undefined, "OPEN")} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Send to purchase
            </Button>
          </>
        )}

        {status === "OPEN" && can.addQuote && (
          <Button asChild>
            <Link href={`/indents/${indent.id}/quotations/new`}>
              <PlusIcon />
              Add quotation
            </Link>
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
              Approve selection
            </Button>
          </>
        )}

        {status === "APPROVED" && can.createPOs && (
          <Button
            onClick={() =>
              run(
                () => createPurchaseOrders(indent.id),
                "Creating purchase orders…",
                indent.vendorCount === 1 ? "Purchase order created" : `${indent.vendorCount} purchase orders created`,
                (data) => router.push(data.ids.length === 1 ? `/purchase-orders/${data.ids[0]}` : `/indents/${indent.id}#purchase-orders`),
                "ORDERED",
              )
            }
            disabled={pending}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <FilePlus2Icon />}
            {indent.vendorCount === 1 ? "Create purchase order" : `Create ${indent.vendorCount} purchase orders`}
          </Button>
        )}

        {cancellable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
                <BanIcon />
                Cancel indent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ReasonDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Approve vendor selection?"
        description={`Purchase can then create ${indent.vendorCount === 1 ? "the purchase order" : `${indent.vendorCount} purchase orders`} with the approved rates, without a further approval.`}
        label="Note (optional)"
        placeholder="e.g. Negotiate freight with vendor before issuing"
        confirmLabel="Approve"
        minLength={0}
        pending={pending}
        onConfirm={(note) => run(() => approveComparison(indent.id, note), "Approving…", "Vendor selection approved", () => returnTo && router.push(returnTo), "APPROVED")}
      />
      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Send back to purchase"
        description="The indent returns to collecting quotes so purchase can revise the quotations or selection."
        label="What needs to change?"
        placeholder="e.g. Get one more quotation; re-check vendor B's freight"
        confirmLabel="Send back"
        pending={pending}
        onConfirm={(reason) => run(() => rejectComparison(indent.id, reason), "Sending back…", "Sent back to purchase", undefined, "OPEN")}
      />
      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Cancel ${indent.indentNumber}?`}
        description="The requirement is closed and kept for records. Quotations stay attached."
        label="Reason"
        confirmLabel="Cancel indent"
        destructive
        pending={pending}
        onConfirm={(reason) => run(() => cancelIndent(indent.id, reason), "Cancelling indent…", "Indent cancelled", undefined, "CANCELLED")}
      />
    </>
  );
}
