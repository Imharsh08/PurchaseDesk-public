"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation dialog that collects a short reason or note. Set minLength to 0 for an optional note.
 * `suggestions`: common reasons, one click to fill in (and edit).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  destructive,
  minLength = 3,
  pending,
  onConfirm,
  children,
  suggestions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  minLength?: number;
  pending: boolean;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
  suggestions?: string[];
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <Field>
          <FieldLabel htmlFor="reason">{label}</FieldLabel>
          <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} autoFocus />
          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setReason(s)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Back
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || reason.trim().length < minLength}
            onClick={() => onConfirm(reason)}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
