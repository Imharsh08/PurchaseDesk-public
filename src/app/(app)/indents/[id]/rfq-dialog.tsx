"use client";

import { useState } from "react";
import { Loader2Icon, MailIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import { sendRfq } from "../actions";

export type RfqVendor = { id: number; name: string; email: string | null; city: string | null; suggested: boolean };

export function RfqDialog({
  indentId,
  vendors,
  subject,
  message,
  gmailConnected,
  connectHref,
}: {
  indentId: number;
  vendors: RfqVendor[];
  subject: string;
  message: string;
  gmailConnected: boolean;
  connectHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useServerAction();
  const [chosen, setChosen] = useState<number[]>(() => vendors.filter((v) => v.suggested && v.email).map((v) => v.id));
  const [form, setForm] = useState({ subject, message });
  const toggle = (id: number) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  function send() {
    run(() => sendRfq(indentId, { vendorIds: chosen, ...form }), {
      pending: `Sending to ${chosen.length} vendor${chosen.length === 1 ? "" : "s"}…`,
      success: (data) => `Quotation request sent to ${data.sent.join(", ")}`,
      onSuccess: (data) => {
        if (data.failed.length) toast.warning(`Not sent: ${data.failed.join(", ")}`);
        setOpen(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MailIcon />
          Email RFQ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request quotations by email</DialogTitle>
          <DialogDescription>Each vendor gets a separate email from your own address; replies come to your inbox.</DialogDescription>
        </DialogHeader>
        {!gmailConnected && (
          <Alert>
            <MailIcon />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              Connect your Gmail once to send from your address.
              <Button size="sm" asChild>
                <a href={connectHref}>Connect Gmail</a>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-4">
          <Field>
            <FieldLabel>Vendors ({chosen.length} selected)</FieldLabel>
            <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
              {vendors.map((v) => (
                <li key={v.id}>
                  <label className={`flex items-center gap-2 px-3 py-2 text-sm ${v.email ? "cursor-pointer hover:bg-muted/50" : "opacity-50"}`}>
                    <Checkbox checked={chosen.includes(v.id)} disabled={!v.email} onCheckedChange={() => toggle(v.id)} />
                    <span className="flex-1">
                      {v.name}
                      {v.suggested && <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">supplies these items</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{v.email ?? "no email saved"}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Field>
          <Field>
            <FieldLabel htmlFor="rfq-subject">Subject</FieldLabel>
            <Input id="rfq-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rfq-message">Message</FieldLabel>
            <Textarea id="rfq-message" rows={12} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="font-mono text-xs" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending || !gmailConnected || chosen.length === 0}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send to {chosen.length} vendor{chosen.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
