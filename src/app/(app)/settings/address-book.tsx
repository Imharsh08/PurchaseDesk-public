"use client";

import { useOptimistic, useState } from "react";
import { MapPinIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AddressBlock, AddressDialog } from "@/components/address-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerAction } from "@/hooks/use-server-action";
import type { AddressOption } from "@/lib/addresses";
import { removeAddress } from "./address-actions";

/** Billing / shipping addresses that purchase picks from on each PO. */
export function AddressBook({ addresses }: { addresses: AddressOption[] }) {
  const [editing, setEditing] = useState<AddressOption | "new" | null>(null);
  // Removed rows disappear at once; the server's list replaces this when it arrives.
  const [list, hide] = useOptimistic(addresses, (current, id: number) => current.filter((a) => a.id !== id));
  const [, run] = useServerAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing & shipping addresses</CardTitle>
        <CardDescription>
          Printed in the &ldquo;Billing Details&rdquo; and &ldquo;Shipping Address&rdquo; boxes of the PO. The defaults are filled in on new POs; purchase can pick
          another one, or add a new address, while preparing the PO.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add address
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <MapPinIcon className="size-4" />
            No addresses yet. Until one is added, POs print the company name, GSTIN and letterhead address.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.label}</span>
                  {a.defaultBilling && <Badge variant="secondary">Default billing</Badge>}
                  {a.defaultShipping && <Badge variant="secondary">Default shipping</Badge>}
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.label}`} onClick={() => setEditing(a)}>
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${a.label}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        run(
                          async () => {
                            hide(a.id);
                            return removeAddress(a.id);
                          },
                          { success: `“${a.label}” removed` },
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
                <AddressBlock text={a.details} className="rounded-md bg-muted/40 px-3 py-2" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AddressDialog
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        address={editing && editing !== "new" ? editing : undefined}
        canSetDefaults
        onSaved={() => setEditing(null)}
      />
    </Card>
  );
}
