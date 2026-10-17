"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { adminDeleteRecord, setDeletePassword } from "@/app/(app)/admin-delete-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useServerAction } from "@/hooks/use-server-action";
import type { DeletableEntity } from "@/lib/admin-delete";

const LIST_PAGE: Record<DeletableEntity, string> = {
  indent: "/indents",
  quotation: "/indents",
  purchase_order: "/purchase-orders",
  goods_receipt: "/goods-receipts",
  bill: "/bills",
  item: "/items",
  vendor: "/vendors",
};

type AdminDeleteState = { allowed: boolean; passwordSet: boolean };
const AdminDeleteContext = createContext<AdminDeleteState>({ allowed: false, passwordSet: false });

/** Set once in the app layout: whether the signed-in user may delete, and whether the password exists. */
export function AdminDeleteProvider({ value, children }: { value: AdminDeleteState; children: React.ReactNode }) {
  return <AdminDeleteContext.Provider value={value}>{children}</AdminDeleteContext.Provider>;
}

/** Whether the signed-in user is a delete admin. */
export function useCanAdminDelete() {
  return useContext(AdminDeleteContext).allowed;
}

/**
 * "Delete" for records entered by mistake. Renders nothing unless the user is one of the delete
 * admins; asks for the admin delete password (and lets them set it the first time).
 */
export function AdminDeleteButton({
  entity,
  id,
  name,
  consequences,
  icon = false,
  stay = false,
}: {
  entity: DeletableEntity;
  id: number;
  /** What is being deleted, e.g. "PO-2026-0004". */
  name: string;
  /** What goes with it, shown in the dialog. */
  consequences?: React.ReactNode;
  /** Small icon button (for table rows). */
  icon?: boolean;
  /** Stay on the current page after deleting (e.g. a quotation row on its indent). */
  stay?: boolean;
}) {
  const { allowed, passwordSet } = useContext(AdminDeleteContext);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"delete" | "password">("delete");
  const [password, setPassword] = useState("");
  const [next, setNext] = useState({ current: "", password: "", confirm: "" });
  const [pending, run] = useServerAction();
  if (!allowed) return null;

  const settingUp = !passwordSet || mode === "password";
  const reset = () => {
    setPassword("");
    setNext({ current: "", password: "", confirm: "" });
    setMode("delete");
  };

  function remove() {
    // Without `stay`, the server redirects to the list page in the same response.
    run(() => adminDeleteRecord(entity, id, password, stay), {
      pending: `Deleting ${name}…`,
      success: `Deleted ${name}`,
      onSuccess: () => {
        setOpen(false);
        reset();
      },
      onError: () => setPassword(""),
      // Reply lost: the record may well be gone, so show its list rather than a "not found" page.
      onLost: () => {
        setOpen(false);
        reset();
        if (stay) router.refresh();
        else router.push(LIST_PAGE[entity]);
      },
    });
  }

  function savePassword() {
    run(() => setDeletePassword(next.current, next.password), {
      pending: "Saving admin password…",
      success: passwordSet ? "Admin delete password changed" : "Admin delete password set",
      onSuccess: reset,
    });
  }

  const trigger = icon ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${name}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Delete permanently (admin)</TooltipContent>
    </Tooltip>
  ) : (
    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
      <Trash2Icon />
      Delete
    </Button>
  );

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {settingUp ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRoundIcon className="size-4" />
                  {passwordSet ? "Change admin delete password" : "Set the admin delete password"}
                </DialogTitle>
                <DialogDescription>
                  {passwordSet
                    ? "The new password replaces the old one for both delete admins."
                    : "Deleting records needs a password shared by the delete admins. Set it once; you'll enter it for every delete."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {passwordSet && (
                  <Field>
                    <FieldLabel htmlFor="del-current">Current password</FieldLabel>
                    <Input id="del-current" type="password" autoComplete="off" value={next.current} onChange={(e) => setNext({ ...next, current: e.target.value })} />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="del-new">New password</FieldLabel>
                  <Input id="del-new" type="password" autoComplete="new-password" value={next.password} onChange={(e) => setNext({ ...next, password: e.target.value })} />
                  <FieldDescription>At least 8 characters. Keep it separate from your login.</FieldDescription>
                </Field>
                <Field data-invalid={!!next.confirm && next.confirm !== next.password}>
                  <FieldLabel htmlFor="del-confirm">Confirm new password</FieldLabel>
                  <Input id="del-confirm" type="password" autoComplete="new-password" value={next.confirm} onChange={(e) => setNext({ ...next, confirm: e.target.value })} />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => (passwordSet ? setMode("delete") : setOpen(false))} disabled={pending}>
                  Back
                </Button>
                <Button
                  onClick={savePassword}
                  disabled={pending || next.password.length < 8 || next.password !== next.confirm || (passwordSet && !next.current)}
                >
                  {pending && <Loader2Icon className="animate-spin" />}
                  Save password
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (password) remove();
              }}
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-4 text-destructive" />
                  Permanently delete {name}?
                </DialogTitle>
                <DialogDescription>
                  This can&apos;t be undone. Use it for entries made by mistake; for real records, cancel or mark inactive instead.
                </DialogDescription>
              </DialogHeader>
              {consequences && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">{consequences}</div>}
              <Field>
                <FieldLabel htmlFor="del-password">Admin delete password</FieldLabel>
                <Input id="del-password" type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setMode("password")}>
                  Change admin password
                </button>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Keep it
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || !password}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                  Delete permanently
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
