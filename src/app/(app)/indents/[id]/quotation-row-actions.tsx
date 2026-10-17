"use client";

import { useState } from "react";
import Link from "@/components/link";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { AdminDeleteButton, useCanAdminDelete } from "@/components/admin-delete";
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
import { useServerAction } from "@/hooks/use-server-action";
import { deleteQuotation } from "../actions";

export function QuotationRowActions({ indentId, quotationId, vendorName }: { indentId: number; quotationId: number; vendorName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useServerAction();
  // Delete admins get the password-protected delete instead of the plain remove (one trash icon per row).
  const admin = useCanAdminDelete();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" asChild aria-label={`Edit quotation from ${vendorName}`}>
        <Link href={`/indents/${indentId}/quotations/${quotationId}/edit`}>
          <PencilIcon />
        </Link>
      </Button>
      {admin ? (
        <AdminDeleteButton entity="quotation" id={quotationId} name={`${vendorName}'s quotation`} icon stay />
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove quotation from ${vendorName}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon />
        </Button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {vendorName}&apos;s quotation?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed from the comparative statement.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteQuotation(indentId, quotationId), {
                  pending: "Removing quotation…",
                  success: "Quotation removed",
                  onSuccess: () => setOpen(false),
                });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
