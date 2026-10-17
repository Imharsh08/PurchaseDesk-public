import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { ClipboardPlusIcon, StarIcon } from "lucide-react";
import { AdminDeleteButton } from "@/components/admin-delete";
import { DateRangeNotice } from "@/components/date-range-notice";
import { PageHeader } from "@/components/page-header";
import { RateHistoryTable } from "@/components/rate-history-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DATES } from "@/lib/date-range";
import { formatAmount, formatDate, formatDateTime, formatQty, toNumber } from "@/lib/format";
import { can } from "@/lib/roles";
import { describePacks } from "@/lib/stock";
import { describeFactor, sameUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { ScreenUser } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadItemScreen } from "@/lib/screens/item";

const SOURCE_LABEL = { MANUAL: "Agreed", QUOTATION: "Quote", PO: "PO" } as const;

type Data = NonNullable<Awaited<ReturnType<typeof loadItemScreen>>>;
export type ItemViewProps = Pick<Data, "activeRates" | "bought" | "current" | "history" | "item" | "lastPO" | "links" | "lowest" | "onOrder" | "packItem" | "pendingLines" | "perf" | "position" | "status" | "stockLog" | "unitItem"> & {
  id: number;
  range: DateRange | null;
  user: ScreenUser;
};

export function ItemView({ activeRates, bought, current, history, id, item, lastPO, links, lowest, onOrder, packItem, pendingLines, perf, position, range, status, stockLog, unitItem, user }: ItemViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href="/items">Items</BackLink>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.name}
            <Badge className={cn("border-transparent text-xs", status.tone)}>{status.label}</Badge>
          </span>
        }
        description={
          <>
            <span className="font-mono text-xs">{item.sku}</span>
            {item.category ? ` · ${item.category}` : ""} · {item.uom}
            {item.packUnit && item.packSize && !sameUnit(item.packUnit, item.uom) ? ` · 1 ${item.packUnit} = ${formatQty(item.packSize)} ${item.uom}` : ""}
            {unitItem.units.map((u) => ` · ${describeFactor(u.unit, u.factor, item.uom, formatQty)}`).join("")}
            {item.hsnCode ? ` · HSN ${item.hsnCode}` : ""}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user.roles, "raiseIndent") && (
              <Button asChild>
                <Link href={`/indents/new?items=${id}:${position.suggested || toNumber(item.reorderQty) || 1}`}>
                  <ClipboardPlusIcon />
                  Raise indent
                </Link>
              </Button>
            )}
            <AdminDeleteButton
              entity="item"
              id={id}
              name={item.name}
              consequences="Its stock history and vendor links are deleted too. Not possible if the item is on any indent, PO or goods receipt; mark it inactive instead."
            />
          </div>
        }
      />

      <DateRangeNotice value={range?.value ?? ALL_DATES} what="rate and stock history" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat
          label="In stock"
          value={current === null ? "Not counted" : describePacks(current, packItem, formatQty)}
          sub={item.stockUpdatedAt ? `Counted ${formatDate(item.stockUpdatedAt)}${item.stockUpdatedBy ? ` by ${item.stockUpdatedBy.name}` : ""}` : "No count yet"}
        />
        <Stat
          label="Minimum / re-order"
          value={item.minStock === null ? "Not set" : `${formatQty(item.minStock)} ${item.uom}`}
          sub={item.reorderQty === null ? "No re-order qty" : `Re-order ${formatQty(item.reorderQty)} ${item.uom}`}
        />
        <Stat
          label="On order"
          value={`${formatQty(onOrder)} ${item.uom}`}
          sub={position.suggested > 0 ? `Suggested order ${describePacks(position.suggested, packItem, formatQty)}` : "Nothing more to order"}
        />
        <Stat
          label={range ? `Purchased · ${range.label}` : "Purchased · all dates"}
          value={`${describePacks(bought.qty, packItem, formatQty)}${bought.unconverted.length ? ` + ${bought.unconverted.join(" + ")}` : ""}`}
          sub={
            bought.lines
              ? `${bought.lines} PO line${bought.lines === 1 ? "" : "s"} · ₹${formatAmount(bought.value)} before GST · ${formatQty(bought.received)} ${item.uom} received${
                  bought.unconverted.length ? " · some units have no conversion yet" : ""
                }`
              : "No POs in this period"
          }
        />
        <Stat
          label="Last purchase rate"
          value={lastPO ? (lastPO.itemRate !== null ? `₹${formatAmount(lastPO.itemRate)}/${item.uom}` : `₹${formatAmount(lastPO.rate)}/${lastPO.uom}`) : "—"}
          sub={lastPO ? `${lastPO.vendorName} · ${formatDate(lastPO.date)}` : range ? `Not ordered in ${range.label.toLowerCase()}` : "Never ordered"}
        />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Vendors for this item</CardTitle>
          <CardDescription>Current rate per vendor with their delivery and quality record (last 12 months). Lowest rate is highlighted.</CardDescription>
        </CardHeader>
        {links.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No vendors linked yet. Vendors are added when they quote for this item, or from a vendor&apos;s page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 pl-4">Vendor</th>
                  <th className="py-2.5 pr-3">Brand / grade</th>
                  <th className="py-2.5 pr-3 text-right">Rate</th>
                  <th className="py-2.5 pr-3">Based on</th>
                  <th className="py-2.5 pr-3 text-right">On time</th>
                  <th className="py-2.5 pr-3 text-right">Rejection</th>
                  <th className="py-2.5 pr-3 text-right">Open issues</th>
                  <th className="py-2.5 pr-4 text-right">Lead time</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const p = perf[l.vendorId];
                  const isLowest = l.active && l.rate !== null && toNumber(l.rate) === lowest && activeRates.length > 1;
                  const lead = l.leadTimeDays ?? l.vendor.leadTimeDays;
                  return (
                    <tr key={l.id} className={cn("border-b last:border-b-0", !l.active && "text-muted-foreground")}>
                      <td className="py-2.5 pl-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          {l.preferred && <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-label="Preferred" />}
                          <Link href={`/vendors/${l.vendor.id}`} className="hover:text-primary hover:underline">
                            {l.vendor.name}
                          </Link>
                          {!l.active && <Badge variant="secondary">Not supplying</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{l.vendor.city ?? ""}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {l.vendorItemCode ? <span className="font-medium">{l.vendorItemCode}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={cn("py-2.5 pr-3 text-right font-medium tabular", isLowest && "text-emerald-700 dark:text-emerald-400")}>
                        {l.rate === null ? "—" : `₹${formatAmount(l.rate)}`}
                        {isLowest && <div className="text-xs font-normal">Lowest</div>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {SOURCE_LABEL[l.rateSource]}
                        {l.rateDate ? ` · ${formatDate(l.rateDate)}` : ""}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular">{p?.onTimePct == null ? "—" : `${p.onTimePct}%`}</td>
                      <td className={cn("py-2.5 pr-3 text-right tabular", (p?.rejectionPct ?? 0) > 5 && "text-rose-600")}>
                        {p?.rejectionPct == null ? "—" : `${p.rejectionPct}%`}
                      </td>
                      <td className={cn("py-2.5 pr-3 text-right tabular", (p?.openIssues ?? 0) > 0 && "font-medium text-rose-600")}>{p?.openIssues ?? 0}</td>
                      <td className="py-2.5 pr-4 text-right tabular">{lead === null ? "—" : `${lead} d`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Rate history</CardTitle>
          <CardDescription>
            {range ? `Quotations and purchase orders dated ${range.span}` : "All quotations and purchase orders for this item"}, newest first (net of discount, before GST).
          </CardDescription>
        </CardHeader>
        <RateHistoryTable rows={history} show="vendor" empty={range ? `No quotations or purchase orders in ${range.span}.` : undefined} />
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Stock history</CardTitle>
            <CardDescription>Physical counts and quantities accepted from goods receipts</CardDescription>
          </CardHeader>
          {stockLog.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{range ? `No stock entries in ${range.span}.` : "No stock entries yet."}</p>
          ) : (
            <ul className="divide-y">
              {stockLog.map((s) => {
                const after = toNumber(s.quantity);
                const delta = s.previousQty === null ? null : after - toNumber(s.previousQty);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Badge variant={s.kind === "RECEIPT" ? "default" : "outline"} className={cn(s.kind === "RECEIPT" && "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>
                      {s.kind === "RECEIPT" ? "Receipt" : "Count"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {s.grn ? (
                          <Link href={`/goods-receipts/${s.grn.id}`} className="text-primary hover:underline">
                            {s.note ?? s.grn.grnNumber}
                          </Link>
                        ) : (
                          (s.note ?? "Stock count")
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(s.countedAt)} · {s.countedBy.name}
                      </div>
                    </div>
                    <div className="text-right tabular">
                      <div className="font-medium">{describePacks(after, packItem, formatQty)}</div>
                      {delta !== null && delta !== 0 && (
                        <div className={cn("text-xs", delta > 0 ? "text-emerald-600" : "text-rose-600")}>
                          {delta > 0 ? "+" : ""}
                          {formatQty(delta)} {item.uom}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open orders</CardTitle>
            <CardDescription>Quantity still to be received on issued POs</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending from vendors.</p>
            ) : (
              <ul className="space-y-2">
                {pendingLines.map((l) => (
                  <li key={l.po.id}>
                    <Link href={`/purchase-orders/${l.po.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm hover:border-primary/40 hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{l.po.poNumber}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {l.po.vendor.name} · ₹{formatAmount(l.rate)}/{l.uom}
                          {l.po.expectedDeliveryDate ? ` · due ${formatDate(l.po.expectedDeliveryDate)}` : ""}
                        </div>
                      </div>
                      <div className="text-right font-medium tabular">
                        {formatQty(l.pending)} {l.uom}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="gap-1.5">
      <CardHeader>
        <CardDescription className="font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold tracking-tight tabular">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
