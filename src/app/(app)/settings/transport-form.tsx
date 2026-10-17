"use client";

import { useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { SaveState } from "@/components/save-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import { parseRoutes, routeCities, routesText, type TransportSettings } from "@/lib/transport";
import { saveTransportSettings } from "./actions";

/** What would be saved, to compare with what was. */
const snapshot = (destination: string, text: string) => JSON.stringify([destination.trim(), parseRoutes(text).routes]);

export function TransportForm({ initial }: { initial: TransportSettings }) {
  const [destination, setDestination] = useState(initial.destination);
  const [text, setText] = useState(() => routesText(initial.routes));
  const [saved, setSaved] = useState(() => snapshot(initial.destination, routesText(initial.routes)));
  const [pending, run] = useServerAction();
  const { routes, problems } = useMemo(() => parseRoutes(text), [text]);
  const dirty = snapshot(destination, text) !== saved;

  function save() {
    const sent = snapshot(destination, text);
    run(() => saveTransportSettings({ destination, routes }), { pending: "Saving transport list…", success: "Transport list saved", onSuccess: () => setSaved(sent) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transport from vendor cities</CardTitle>
        <CardDescription>
          Which transporter brings material from each city. A new PO suggests the first one for the vendor&apos;s city (or the vendor&apos;s own
          preferred transport) in its terms, so it is confirmed with the vendor; at dispatch the doer picks from this list or types another,
          which is then suggested for that city next time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field className="max-w-sm">
          <FieldLabel htmlFor="transport-destination">Material comes to</FieldLabel>
          <Input id="transport-destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. MIDC Chakan, Pune" />
          <FieldDescription>Our shipping place, shown as “Mumbai → {destination.trim() || "…"}”.</FieldDescription>
        </Field>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="transport-routes">City, transporter: one per line</FieldLabel>
            <Textarea
              id="transport-routes"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Delhi, Vin General Transport\nMumbai, Vijay Lakshmi Transport\nNoida, Thru Your Vehicle"}
              className="font-mono text-sm leading-relaxed"
              spellCheck={false}
            />
            <FieldDescription>
              Paste straight from a sheet (City and Transport columns). List a city&apos;s usual transporter first. Use “Thru Your Vehicle” when we
              collect it ourselves, “Courier” for small parcels.
            </FieldDescription>
            {problems.length > 0 && (
              <ul className="space-y-0.5 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Field>
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {routeCities(routes).length} cities · {routes.length} transporters
            </div>
            <ul className="divide-y rounded-lg border text-sm">
              {routeCities(routes).map((city) => {
                const names = routes.filter((r) => r.city.toLowerCase() === city.toLowerCase()).map((r) => r.name);
                return (
                  <li key={city} className="px-3 py-2">
                    <div className="font-medium">
                      {city}
                      {destination.trim() && <span className="font-normal text-muted-foreground"> → {destination.trim()}</span>}
                    </div>
                    <div className="text-muted-foreground">
                      <span className="text-foreground">{names[0]}</span>
                      {names.length > 1 && <> · {names.slice(1).join(" · ")}</>}
                    </div>
                  </li>
                );
              })}
              {routes.length === 0 && <li className="px-3 py-6 text-center text-muted-foreground">No cities yet.</li>}
            </ul>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        <SaveState dirty={dirty} />
        <Button onClick={save} disabled={pending || !dirty || problems.length > 0}>
          {pending && <Loader2Icon className="animate-spin" />}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
