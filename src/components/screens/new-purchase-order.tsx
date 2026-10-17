import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { ArrowRightIcon, ClipboardListIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { can } from "@/lib/roles";
import type { ScreenUser } from "@/components/screens/types";
import type { loadNewPurchaseOrderScreen } from "@/lib/screens/forms";

/**
 * Purchase orders are not created directly: indent → at least three quotations →
 * approved comparative statement → PO. This page points people at that flow.
 */

type Data = NonNullable<Awaited<ReturnType<typeof loadNewPurchaseOrderScreen>>>;
export type NewPurchaseOrderViewProps = Pick<Data, "ready"> & {
  user: ScreenUser;
};

export function NewPurchaseOrderView({ ready, user }: NewPurchaseOrderViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href="/purchase-orders">Purchase orders</BackLink>
        }
        title="New purchase order"
        description={`Purchase orders are created from an approved indent: raise the indent, collect at least ${MIN_QUOTATIONS} quotations, get the vendor selection approved, then create the PO.`}
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Approved indents ready for a PO</CardTitle>
          <CardDescription>Open one and use “Create purchase order”.</CardDescription>
        </CardHeader>
        {ready.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title="No approved indents waiting"
            description="Once a manager approves a comparative statement, the indent appears here."
            action={
              can(user.roles, "raiseIndent") ? (
                <Button asChild>
                  <Link href="/indents/new">
                    <PlusIcon />
                    Raise an indent
                  </Link>
                </Button>
              ) : undefined
            }
            className="py-10"
          />
        ) : (
          <ul className="divide-y">
            {ready.map((ind) => (
              <li key={ind.id}>
                <Link href={`/indents/${ind.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{ind.indentNumber}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {[ind.department, ind.items.map((i) => i.description).join(", ")].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <ArrowRightIcon className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
