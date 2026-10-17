"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "@/components/link";
import { ChevronsUpDownIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { SaveState } from "@/components/save-state";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { Role } from "@/generated/prisma/enums";
import { DEFAULT_TAT, FMS_STEPS, canDoStep, formatHours, type StepCode, type TatSettings } from "@/lib/fms-steps";
import { roleNames } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { saveTatSettings } from "./actions";

type User = { id: number; name: string; roles: Role[] };
type Row = { normal: string; urgent: string; doers: number[] };

/** What would be saved, to compare with what was ("24" and "24.0" are the same; doer order doesn't count). */
const snapshot = (tat: Record<StepCode, Row>, sundays: boolean) =>
  JSON.stringify([sundays, FMS_STEPS.map((s) => [Number(tat[s.code].normal), Number(tat[s.code].urgent), [...tat[s.code].doers].sort((a, b) => a - b)])]);

export function TatForm({ initial, countSundays, users }: { initial: TatSettings; countSundays: boolean; users: User[] }) {
  const toRows = (t: TatSettings) =>
    Object.fromEntries(FMS_STEPS.map((s) => [s.code, { normal: String(t[s.code].normal), urgent: String(t[s.code].urgent), doers: t[s.code].doers }])) as Record<
      StepCode,
      Row
    >;
  const [tat, setTat] = useState(() => toRows(initial));
  const [sundays, setSundays] = useState(countSundays);
  // What is saved now: Save is on only when the form differs from it.
  const [saved, setSaved] = useState(() => snapshot(toRows(initial), countSundays));
  const dirty = snapshot(tat, sundays) !== saved;
  const [pending, run] = useServerAction();
  // Stable, so a keystroke re-renders only the row being edited (rows are memoised).
  const set = useCallback((code: StepCode, patch: Partial<Row>) => setTat((t) => ({ ...t, [code]: { ...t[code], ...patch } })), []);
  const usersByStep = useMemo(
    () => Object.fromEntries(FMS_STEPS.map((s) => [s.code, users.filter((u) => canDoStep(u.roles, s.code))])) as Record<StepCode, User[]>,
    [users],
  );

  function save() {
    const sent = snapshot(tat, sundays);
    run(
      () =>
        saveTatSettings({
          countSundays: sundays,
          tat: Object.fromEntries(
            FMS_STEPS.map((s) => [s.code, { normal: Number(tat[s.code].normal), urgent: Number(tat[s.code].urgent), doers: tat[s.code].doers }]),
          ) as TatSettings,
        }),
      { pending: "Saving FMS steps…", success: "FMS steps saved", onSuccess: () => setSaved(sent) },
    );
  }

  return (
    <Card id="tat" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>FMS steps, doers & turnaround time (TAT)</CardTitle>
        <CardDescription>
          Who is responsible for each step, and the hours allowed after the previous step is done (urgent indents use the urgent TAT). A step&apos;s doers
          see it under “My tasks” in the FMS tracker and get the email when it falls due. With no doer set (“Anyone allowed”), everyone with a
          role that allows the step sees it and is emailed. Either way, anyone whose role allows the step can complete it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Step</th>
                <th className="w-56 py-2 pr-3">Doers</th>
                <th className="w-28 py-2 pr-3">Normal (h)</th>
                <th className="w-28 py-2">Urgent (h)</th>
              </tr>
            </thead>
            <tbody>
              {FMS_STEPS.map((s) => (
                <TatRow key={s.code} step={s} row={tat[s.code]} users={usersByStep[s.code]} onChange={set} />
              ))}
            </tbody>
          </table>
        </div>
        <Field orientation="horizontal" className="w-fit">
          <Switch id="tat-sundays" checked={sundays} onCheckedChange={setSundays} />
          <FieldLabel htmlFor="tat-sundays">Count Sundays in TAT</FieldLabel>
        </Field>
      </CardContent>
      <CardFooter className="justify-between">
        <Button
          variant="ghost"
          onClick={() =>
            setTat((t) => {
              const d = toRows(DEFAULT_TAT);
              // Reset hours only; keep the doers.
              for (const s of FMS_STEPS) d[s.code].doers = t[s.code].doers;
              return d;
            })
          }
        >
          <RotateCcwIcon />
          Default hours
        </Button>
        <div className="flex items-center gap-3">
          <SaveState dirty={dirty} />
          <Button onClick={save} disabled={pending || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

const TatRow = memo(function TatRow({
  step: s,
  row,
  users,
  onChange,
}: {
  step: (typeof FMS_STEPS)[number];
  row: Row;
  users: User[];
  onChange: (code: StepCode, patch: Partial<Row>) => void;
}) {
  return (
    <tr className="border-b align-top last:border-b-0">
      <td className="py-2 pr-3">
        <div className="font-medium">
          <span className="text-primary">{s.code}</span> {s.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {s.how}
          {s.note ? ` · ${s.note}` : ""}
        </div>
      </td>
      <td className="py-2 pr-3">
        <DoerPicker users={users} value={row.doers} onChange={(doers) => onChange(s.code, { doers })} label={`${s.code} doers`} />
      </td>
      {(["normal", "urgent"] as const).map((k) => (
        <td key={k} className={k === "normal" ? "py-2 pr-3" : "py-2"}>
          <Input
            inputMode="numeric"
            value={row[k]}
            onChange={(e) => onChange(s.code, { [k]: e.target.value })}
            className="text-right tabular"
            aria-label={`${s.code} ${k} TAT hours`}
          />
          <div className="mt-0.5 text-right text-xs text-muted-foreground">{formatHours(Number(row[k]) || 0)}</div>
        </td>
      ))}
    </tr>
  );
});

function DoerPicker({ users, value, onChange, label }: { users: User[]; value: number[]; onChange: (ids: number[]) => void; label: string }) {
  const chosen = users.filter((u) => value.includes(u.id));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-auto min-h-9 w-full justify-between py-1.5 text-left font-normal", !chosen.length && "text-muted-foreground")} aria-label={label}>
          <span className="line-clamp-2 whitespace-normal">{chosen.length ? chosen.map((u) => u.name).join(", ") : "Anyone allowed"}</span>
          <ChevronsUpDownIcon className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        {users.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No active user has a role that can do this step.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={value.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
                  <span className="flex-1">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{roleNames(u.roles)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
          Only users with a role that allows this step are listed. Give someone more roles in{" "}
          <Link href="/users" className="text-primary underline-offset-4 hover:underline">
            Users
          </Link>
          .
        </p>
      </PopoverContent>
    </Popover>
  );
}
