import Link from "@/components/link";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ShowMore } from "@/components/show-more";
import { DateRangeNotice } from "@/components/date-range-notice";
import { POStatusBadge } from "@/components/po-status-badge";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_DATES } from "@/lib/date-range";
import { formatDate, formatINR, formatQty } from "@/lib/format";
import { poDisplayNumber } from "@/lib/po-status";
import { PO_TABS } from "@/lib/screens/options";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadPurchaseOrderList } from "@/lib/screens/purchase-orders";

type Data = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrderList>>>;
export type PurchaseOrdersViewProps = Pick<Data, "orders" | "tab" | "tabCounts"> & {
  limit: number;
  query: string;
  range: DateRange | null;
  sp: SearchParams;
  user: ScreenUser;
};

export function PurchaseOrdersView({ limit, orders, query, range, sp, tab: tabKey, tabCounts, user }: PurchaseOrdersViewProps) {
  const tab = PO_TABS.find((t) => t.key === tabKey) ?? PO_TABS[0];
  // POs with the vendor: show who to call and which transporter brings the material.
  const withVendor = tab.key === "open";
  const hrefFor = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("status", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/purchase-orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase orders"
        description="Created from approved indents; issue and send them to vendors."
        actions={
          can(user.roles, "raiseIndent") && (
            <Button asChild>
              <Link href="/indents/new">
                <PlusIcon />
                Raise indent
              </Link>
            </Button>
          )
        }
      />
      <DateRangeNotice value={range?.value ?? ALL_DATES} what="POs" />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b px-4 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Filter by status">
            {PO_TABS.map((t) => {
              const active = t.key === tab.key;
              const count = tabCounts[t.key];
              return (
                <Link
                  key={t.key}
                  href={hrefFor(t.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-sm transition-colors",
                    active
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] tabular",
                      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      t.key === "pending" && count > 0 && !active && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                    )}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="pb-3">
            <SearchInput placeholder="PO no., vendor, item, transporter" />
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title={query ? "No purchase orders match your search" : "Nothing here yet"}
            description={
              query
                ? "Try a PO number, vendor, item, transporter or quotation reference."
                : tab.key === "all"
                  ? "Purchase orders are created from approved indents. Raise an indent to start."
                  : "No purchase orders in this stage."
            }
            action={
              tab.key === "all" && !query && can(user.roles, "raiseIndent") ? (
                <Button asChild>
                  <Link href="/indents/new">
                    <PlusIcon />
                    Raise indent
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">PO</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Vendor</TableHead>
                {withVendor && <TableHead>Transport</TableHead>}
                <TableHead>PO date</TableHead>
                <TableHead>Delivery by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Created by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => {
                const overdue =
                  po.expectedDeliveryDate &&
                  ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"].includes(po.status) &&
                  po.expectedDeliveryDate < new Date();
                // Optional: the Pages app can go live before the API that sends these is redeployed.
                const first = po.items?.[0];
                const phones = (po.vendor.phone ?? "").split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
                return (
                  <TableRow key={po.id} className="group relative">
                    <TableCell className="pl-4">
                      <Link href={`/purchase-orders/${po.id}`} className="font-medium after:absolute after:inset-0 group-hover:text-primary">
                        {poDisplayNumber(po)}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {po._count.items} line{po._count.items === 1 ? "" : "s"}
                        {po.quotationRef && ` · Ref ${po.quotationRef}`}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56">
                      {first ? (
                        <>
                          <div className="truncate" title={first.description}>
                            {first.description}
                          </div>
                          <div className="text-xs text-muted-foreground tabular">
                            {formatQty(first.quantity)} {first.uom}
                            {po._count.items > 1 && ` · +${po._count.items - 1} more`}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{po.vendor.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{po.vendor.code}</div>
                      {/* With the vendor: who to call to collect the material (above the row's link). */}
                      {withVendor && (po.vendor.contactPerson || phones.length > 0) && (
                        <div className="relative z-10 text-xs text-muted-foreground">
                          {po.vendor.contactPerson}
                          {phones.map((p, i) => (
                            <span key={p}>
                              {(i > 0 || po.vendor.contactPerson) && " · "}
                              <a href={`tel:${p.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">
                                {p}
                              </a>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    {withVendor && (
                      <TableCell className="max-w-44 text-sm">
                        {po.transporter ? (
                          <div className="truncate" title={po.transporter}>
                            {po.transporter}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not given</span>
                        )}
                        {po.dispatchBiltyNo && <div className="text-xs text-muted-foreground">LR {po.dispatchBiltyNo}</div>}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{formatDate(po.poDate)}</TableCell>
                    <TableCell className={cn("text-sm", overdue && "font-medium text-destructive")}>
                      {formatDate(po.expectedDeliveryDate)}
                      {overdue && <div className="text-xs font-normal">Overdue</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatINR(po.grandTotal)}</TableCell>
                    <TableCell>
                      <POStatusBadge status={po.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-sm text-muted-foreground">{po.createdBy.name}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <ShowMore shown={orders.length} total={tabCounts[tab.key]} path="/purchase-orders" searchParams={sp} limit={limit} />
      </Card>
    </div>
  );
}
