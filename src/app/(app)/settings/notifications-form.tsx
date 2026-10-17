"use client";

import { memo, useCallback, useState } from "react";
import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { SaveState } from "@/components/save-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useServerAction } from "@/hooks/use-server-action";
import {
  ATTACH_LABEL,
  DEFAULT_NOTIFICATIONS,
  EVENT_KEYS,
  MAX_EXTRA_ADDRESSES,
  eventDef,
  isEmail,
  splitAddresses,
  type AttachKind,
  type NotificationEvent,
  type NotificationSettings,
} from "@/lib/notification-events";
import { cn } from "@/lib/utils";
import { saveNotificationSettings } from "./actions";

/** A row as edited: the addresses stay as typed until saved. */
type Row = { on: boolean; doers: boolean; to: string; cc: string; attach: AttachKind[] };

const toRows = (s: NotificationSettings) =>
  Object.fromEntries(EVENT_KEYS.map((k) => [k, { ...s[k], to: s[k].to.join(", "), cc: s[k].cc.join(", ") }])) as Record<NotificationEvent, Row>;

/** What would be saved, to compare with what was (spaces and order of addresses/files don't count). */
const snapshot = (rows: Record<NotificationEvent, Row>) =>
  JSON.stringify(EVENT_KEYS.map((k) => ({ ...rows[k], to: splitAddresses(rows[k].to), cc: splitAddresses(rows[k].cc), attach: [...rows[k].attach].sort() })));

/** The addresses in a box that aren't email addresses (shown under it). */
const badAddresses = (text: string) => splitAddresses(text).filter((a) => !isEmail(a));

export function NotificationsForm({ initial, notConnected }: { initial: NotificationSettings; notConnected: string[] }) {
  const [rows, setRows] = useState(() => toRows(initial));
  // What is saved now: Save is on only when the form differs from it.
  const [saved, setSaved] = useState(() => snapshot(toRows(initial)));
  const dirty = snapshot(rows) !== saved;
  const [pending, run] = useServerAction();
  const set = useCallback((key: NotificationEvent, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } })), []);

  const invalid = EVENT_KEYS.some((k) => {
    const r = rows[k];
    return badAddresses(r.to).length > 0 || badAddresses(r.cc).length > 0 || splitAddresses(r.to).length > MAX_EXTRA_ADDRESSES || splitAddresses(r.cc).length > MAX_EXTRA_ADDRESSES;
  });

  function save() {
    const sent = snapshot(rows);
    run(
      () =>
        saveNotificationSettings(
          Object.fromEntries(EVENT_KEYS.map((k) => [k, { ...rows[k], to: splitAddresses(rows[k].to), cc: splitAddresses(rows[k].cc) }])) as NotificationSettings,
        ),
      { pending: "Saving email notifications…", success: "Email notifications saved", onSuccess: () => setSaved(sent) },
    );
  }

  return (
    <Card id="notifications" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>
          Which emails go out when a step is done, to whom, and with which files. Each one is sent from the Gmail of the person who did the step, so
          it only goes out if they have connected Gmail
          {notConnected.length ? ` (not connected yet: ${notConnected.join(", ")})` : ""}. “Doers” are the people set for the next step in the “FMS steps &amp; TAT”
          tab; add fixed addresses such as your accounts mailbox in “Also to” and “CC”, separated by commas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Email</th>
                <th className="w-20 py-2 pr-3">Doers</th>
                <th className="w-56 py-2 pr-3">Also to</th>
                <th className="w-56 py-2 pr-3">CC</th>
                <th className="w-64 py-2">Attach</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_KEYS.map((k) => (
                <NotificationRow key={k} event={k} row={rows[k]} onChange={set} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" onClick={() => setRows(toRows(DEFAULT_NOTIFICATIONS))}>
          <RotateCcwIcon />
          Defaults
        </Button>
        <div className="flex items-center gap-3">
          {invalid ? <span className="text-sm text-destructive">Fix the addresses marked in red.</span> : <SaveState dirty={dirty} />}
          <Button onClick={save} disabled={pending || invalid || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

const NotificationRow = memo(function NotificationRow({
  event,
  row,
  onChange,
}: {
  event: NotificationEvent;
  row: Row;
  onChange: (key: NotificationEvent, patch: Partial<Row>) => void;
}) {
  const def = eventDef(event);
  const nobody = row.on && !row.doers && !splitAddresses(row.to).length && !splitAddresses(row.cc).length;
  return (
    <tr className={cn("border-b align-top last:border-b-0", !row.on && "text-muted-foreground")}>
      <td className="py-2.5 pr-3">
        <label className="flex cursor-pointer items-start gap-3">
          <Switch checked={row.on} onCheckedChange={(on) => onChange(event, { on })} aria-label={`Send “${def.label}”`} className="mt-0.5" />
          <span>
            <span className="block font-medium">
              {def.step && <span className="mr-1.5 text-primary">{def.step}</span>}
              {def.label}
            </span>
            <span className="block text-xs text-muted-foreground">Doers: {def.doers}</span>
            {nobody && <span className="block text-xs text-destructive">Goes to nobody — tick Doers or add an address.</span>}
          </span>
        </label>
      </td>
      <td className="py-2.5 pr-3">
        <Checkbox
          checked={row.doers}
          onCheckedChange={(v) => onChange(event, { doers: v === true })}
          disabled={!row.on}
          aria-label={`${def.label}: send to the doers`}
          className="mt-1"
        />
      </td>
      <AddressCell value={row.to} disabled={!row.on} label={`${def.label}: also to`} onChange={(to) => onChange(event, { to })} />
      <AddressCell value={row.cc} disabled={!row.on} label={`${def.label}: CC`} onChange={(cc) => onChange(event, { cc })} />
      <td className="py-2.5">
        {def.attach.length === 0 ? (
          <span className="text-xs text-muted-foreground">No files at this point</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {def.attach.map((kind) => (
              <label key={kind} className={cn("flex items-center gap-1.5 text-xs", row.on ? "cursor-pointer" : "opacity-60")}>
                <Checkbox
                  checked={row.attach.includes(kind)}
                  disabled={!row.on}
                  onCheckedChange={(v) => onChange(event, { attach: v === true ? [...row.attach, kind] : row.attach.filter((a) => a !== kind) })}
                />
                {ATTACH_LABEL[kind]}
              </label>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
});

function AddressCell({ value, disabled, label, onChange }: { value: string; disabled: boolean; label: string; onChange: (v: string) => void }) {
  const bad = badAddresses(value);
  const tooMany = splitAddresses(value).length > MAX_EXTRA_ADDRESSES;
  return (
    <td className="py-2.5 pr-3">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="name@company.com"
        aria-label={label}
        aria-invalid={bad.length > 0 || tooMany}
        className="h-8 text-xs"
      />
      {bad.length > 0 && <div className="mt-0.5 text-xs text-destructive">Not an email: {bad.join(", ")}</div>}
      {tooMany && <div className="mt-0.5 text-xs text-destructive">At most {MAX_EXTRA_ADDRESSES} addresses</div>}
    </td>
  );
}

