"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { TextField, type FieldErrors } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerAction } from "@/hooks/use-server-action";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/roles";
import { saveUser } from "./actions";

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: "Everything, incl. users & settings",
  MANAGER: "Approves comparisons, POs & bills",
  PURCHASER: "Quotations, POs, follow-up",
  WAREHOUSE: "Receives material, QC, stores it",
  ACCOUNTS: "Enters & passes bills, payments",
};

export function UserDialog({
  user,
  trigger,
  googleSignIn,
  domain,
}: {
  user?: { id: number; name: string; email: string; roles: Role[]; department: string | null; active: boolean; approvalLimit: string | null };
  trigger: React.ReactNode;
  googleSignIn: boolean;
  domain: string;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>();
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? ["PURCHASER"]);
  const [pending, run] = useServerAction();
  const toggleRole = (r: Role) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        saveUser(user?.id ?? null, {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          roles,
          department: String(form.get("department") ?? ""),
          approvalLimit: String(form.get("approvalLimit") ?? ""),
          password: String(form.get("password") ?? ""),
          active: form.get("active") === "on",
        }),
      {
        pending: user ? "Saving user…" : "Adding user…",
        success: user ? "User updated" : "User added",
        onSuccess: () => {
          setErrors(undefined);
          setOpen(false);
        },
        onError: (f) => setErrors(f.fieldErrors),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors(undefined);
        // Reopening starts from the saved roles, not an abandoned edit.
        if (next) setRoles(user?.roles ?? ["PURCHASER"]);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>
            Roles decide what they can do. Someone who covers several jobs (e.g. purchase and store) can hold several roles.
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={onSubmit} className="space-y-4">
          <TextField name="name" label="Full name" required defaultValue={user?.name} errors={errors} />
          <TextField
            name="email"
            label="Work email"
            type="email"
            required
            defaultValue={user?.email}
            placeholder={domain ? `name@${domain}` : undefined}
            description={googleSignIn ? "They sign in with this Google Workspace account." : undefined}
            errors={errors}
          />
          <Field data-invalid={!!errors?.roles}>
            <FieldLabel>
              Roles<span className="text-destructive">*</span>
            </FieldLabel>
            <div className="grid gap-1 sm:grid-cols-2">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{ROLE_LABELS[r]}</span>
                    <span className="block text-xs text-muted-foreground">{ROLE_HINTS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors?.roles ? (
              <FieldError>{errors.roles[0]}</FieldError>
            ) : (
              <FieldDescription>Tick every role this person covers. They can do anything any of their roles allows.</FieldDescription>
            )}
          </Field>
          <TextField name="department" label="Department" defaultValue={user?.department ?? ""} errors={errors} />
          <TextField
            name="approvalLimit"
            label="Approval limit (₹, incl. GST)"
            inputMode="decimal"
            defaultValue={user?.approvalLimit ?? ""}
            placeholder="No limit"
            description="For managers and admins: the highest comparison, PO or amendment value they may approve. Leave blank for no limit."
            errors={errors}
          />
          {!googleSignIn && (
            <TextField
              name="password"
              label={user ? "Reset password" : "Initial password"}
              type="password"
              autoComplete="new-password"
              required={!user}
              placeholder={user ? "Leave blank to keep current password" : "At least 8 characters"}
              errors={errors}
            />
          )}
          <Field orientation="horizontal" className="w-fit">
            <Switch id="user-active" name="active" defaultChecked={user?.active ?? true} />
            <FieldLabel htmlFor="user-active">Active, can sign in</FieldLabel>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {user ? "Save changes" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
