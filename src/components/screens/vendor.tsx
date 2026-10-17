import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { MailIcon, PencilIcon, PhoneIcon, PlusIcon, StarIcon, TruckIcon } from "lucide-react";
import { AdminDeleteButton } from "@/components/admin-delete";
import { DateRangeNotice } from "@/components/date-range-notice";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { RateHistoryTable } from "@/components/rate-history-table";
import { IssueList, RaiseIssueButton } from "@/components/vendor-issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DATES } from "@/lib/date-range";
import { formatAmount, formatDate, formatINR, formatINRCompact, formatQty, toNumber } from "@/lib/format";
import { GRN_STATUS } from "@/lib/grn-labels";
import { CERTIFICATION_LABELS } from "@/lib/quote-scoring";
import { can } from "@/lib/roles";
import { stateName } from "@/lib/states";
import { routeLabel, transportChoices } from "@/lib/transport";
import { cn } from "@/lib/utils";
import { PERFORMANCE_WINDOW_DAYS } from "@/lib/screens/options";
import { VendorDialog } from "@/app/(app)/vendors/vendor-dialog";
import { VendorItemDialog } from "@/app/(app)/vendors/[id]/vendor-item-dialog";
import type { ScreenUser } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadVendorScreen } from "@/lib/screens/vendor";

const SOURCE_LABEL = { MANUAL: "Agreed", QUOTATION: "Quote", PO: "PO" } as const;

type Data = NonNullable<Awaited<ReturnType<typeof loadVendorScreen>>>;
export type VendorViewProps = Pick<Data, "canEdit" | "history" | "issues" | "itemOptions" | "lastPoRate" | "links" | "orders" | "p" | "poAgg" | "receipts" | "vendor"> & {
  id: number;
  range: DateRange | null;
  /** Optional: an API not yet redeployed doesn't send it. */
  transport?: Data["transport"];
  user: ScreenUser;
};

export function VendorView({ canEdit, history, id, issues, itemOptions, lastPoRate, links, orders, p, poAgg, range, receipts, transport, user, vendor }: VendorViewProps) {
  // Who brings this vendor's material: its own choice, else the first transporter listed for its city.
  const choice = transport ? transportChoices(transport, vendor) : null;
  const route = transport && choice ? routeLabel(transport.settings, choice.city) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href="/vendors">Vendors</BackLink>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {vendor.name}
            {!vendor.active && <Badge variant="secondary">Inactive</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{vendor.code}</span>
            <span>{[vendor.city, stateName(vendor.stateCode)].filter(Boolean).join(", ") || "—"}</span>
            {vendor.certification !== "NONE" && <Badge variant="outline">{CERTIFICATION_LABELS[vendor.certification]}</Badge>}
            {vendor.phone && (
              <span className="inline-flex items-center gap-1">
                <PhoneIcon className="size-3" />
                {vendor.phone}
              </span>
            )}
            {vendor.email && (
              <span className="inline-flex items-center gap-1">
                <MailIcon className="size-3" />
                {vendor.email}
              </span>
            )}
            {choice?.recommended && (
              <span className="inline-flex items-center gap-1" title={route ?? undefined}>
                <TruckIcon className="size-3" />
                {choice.recommended}
                {!vendor.preferredTransport && route && <span className="text-xs">({route})</span>}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user.roles, "raiseIssue") && <RaiseIssueButton vendorId={id} />}
            {canEdit && (
              <VendorDialog
                vendor={vendor}
                transport={transport}
                trigger={
                  <Button variant="outline">
                    <PencilIcon />
                    Edit vendor
                  </Button>
                }
              />
            )}
            <AdminDeleteButton
              entity="vendor"
              id={id}
              name={vendor.name}
              consequences="Its item links are deleted too. Not possible if the vendor has quotations, POs, receipts, bills or issues; mark it inactive instead."
            />
          </div>
        }
      />

      <DateRangeNotice value={range?.value ?? ALL_DATES} what="POs, rates, deliveries and issues" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={range ? `Business (POs in ${range.label.toLowerCase()})` : "Business (all issued POs)"} value={formatINRCompact(poAgg._sum.grandTotal)} sub={`${poAgg._count} PO${poAgg._count === 1 ? "" : "s"}`} />
        <Stat
          label="On-time delivery"
          value={p?.onTimePct === null || p?.onTimePct === undefined ? "—" : `${p.onTimePct}%`}
          sub={p?.receipts ? `${p.receipts} receipt${p.receipts === 1 ? "" : "s"} in 12 months` : "No receipts yet"}
          tone={p?.onTimePct != null ? (p.onTimePct >= 90 ? "good" : p.onTimePct >= 70 ? "warn" : "bad") : undefined}
        />
        <Stat
          label="Average delay"
          value={p?.avgDelayDays == null ? "—" : `${p.avgDelayDays} day${p.avgDelayDays === 1 ? "" : "s"}`}
          sub="Past the PO delivery date"
          tone={p?.avgDelayDays != null ? (p.avgDelayDays <= 1 ? "good" : p.avgDelayDays <= 5 ? "warn" : "bad") : undefined}
        />
        <Stat
          label="Rejection"
          value={p?.rejectionPct == null ? "—" : `${p.rejectionPct}%`}
          sub={p?.lines ? `${p.failedLines} of ${p.lines} lines failed a check` : "No checks yet"}
          tone={p?.rejectionPct != null ? (p.rejectionPct <= 2 ? "good" : p.rejectionPct <= 5 ? "warn" : "bad") : undefined}
        />
        <Stat
          label="Open issues"
          value={String(p?.openIssues ?? 0)}
          sub={`${p?.totalIssues ?? 0} raised in total`}
          tone={(p?.openIssues ?? 0) > 0 ? "bad" : undefined}
        />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Items supplied</CardTitle>
          <CardDescription>Current rate per item — updated from this vendor&apos;s latest quotation or PO, or set as an agreed rate.</CardDescription>
          {canEdit && (
            <CardAction>
              <VendorItemDialog
                vendorId={id}
                items={itemOptions}
                trigger={
                  <Button size="sm">
                    <PlusIcon />
                    Add item
                  </Button>
                }
              />
            </CardAction>
          )}
        </CardHeader>
        {links.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No items linked yet. They are added automatically when this vendor quotes or receives a PO.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 pl-4">Item</th>
                  <th className="py-2.5 pr-3">Brand / grade</th>
                  <th className="py-2.5 pr-3 text-right">Current rate</th>
                  <th className="py-2.5 pr-3">Based on</th>
                  <th className="py-2.5 pr-3 text-right">Last PO rate</th>
                  <th className="py-2.5 pr-3 text-right">Lead time</th>
                  {canEdit && <th className="w-12 py-2.5 pr-4" />}
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className={cn("border-b last:border-b-0", !l.active && "text-muted-foreground")}>
                    <td className="py-2.5 pl-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        {l.preferred && <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-label="Preferred" />}
                        <Link href={`/items/${l.item.id}`} className="hover:text-primary hover:underline">
                          {l.item.name}
                        </Link>
                        {!l.active && <Badge variant="secondary">No longer supplied</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.item.sku}
                        {l.notes ? ` · ${l.notes}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {l.vendorItemCode ? <span className="font-medium">{l.vendorItemCode}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular">
                      {l.rate === null ? "—" : `₹${formatAmount(l.rate)}`}
                      <span className="font-normal text-muted-foreground">/{l.item.uom}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {SOURCE_LABEL[l.rateSource]}
                      {l.rateDate ? ` · ${formatDate(l.rateDate)}` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular">{lastPoRate[l.itemId] ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular">{l.leadTimeDays ?? vendor.leadTimeDays ?? "—"}{(l.leadTimeDays ?? vendor.leadTimeDays) !== null ? " d" : ""}</td>
                    {canEdit && (
                      <td className="py-2.5 pr-4">
                        <VendorItemDialog
                          vendorId={id}
                          items={itemOptions}
                          link={{
                            id: l.id,
                            itemId: l.itemId,
                            vendorItemCode: l.vendorItemCode,
                            rate: l.rate?.toString() ?? null,
                            leadTimeDays: l.leadTimeDays,
                            preferred: l.preferred,
                            active: l.active,
                            notes: l.notes,
                          }}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${l.item.name}`}>
                              <PencilIcon />
                            </Button>
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Rate history</CardTitle>
          <CardDescription>Every rate this vendor quoted or was ordered at, newest first (net of discount, before GST).</CardDescription>
        </CardHeader>
        <RateHistoryTable rows={history} show="item" empty={range ? `No quotations or purchase orders in ${range.span}.` : undefined} />
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Deliveries</CardTitle>
            <CardDescription>Goods receipts with timeliness and check results (last {Math.round(PERFORMANCE_WINDOW_DAYS / 30)} months count towards the scores)</CardDescription>
          </CardHeader>
          {receipts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{range ? `No deliveries received in ${range.span}.` : "No deliveries received yet."}</p>
          ) : (
            <ul className="divide-y">
              {receipts.map((g) => {
                const due = g.po.expectedDeliveryDate;
                const late = due ? Math.round((g.receivedAt.getTime() - due.getTime()) / 86_400_000) : null;
                const failed = g.items.filter((l) => l.qtyCheck === "FAIL" || l.qualityCheck === "FAIL").length;
                const rejected = g.items.reduce((s, l) => s + toNumber(l.rejectedQty), 0);
                return (
                  <li key={g.id}>
                    <Link href={`/goods-receipts/${g.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {g.grnNumber} <span className="font-normal text-muted-foreground">· {g.po.poNumber}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(g.receivedAt)}
                          {late !== null && (
                            <span className={late > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}>
                              {" · "}
                              {late > 0 ? `${late}d late` : "on time"}
                            </span>
                          )}
                          {failed > 0 && <span className="text-rose-600"> · {failed} failed{rejected > 0 ? `, ${formatQty(rejected)} rejected` : ""}</span>}
                        </div>
                      </div>
                      <Badge className={cn("border-transparent", GRN_STATUS[g.status].tone)}>{GRN_STATUS[g.status].label}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Recent purchase orders</CardTitle>
          </CardHeader>
          {orders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{range ? `No purchase orders in ${range.span}.` : "No purchase orders yet."}</p>
          ) : (
            <ul className="divide-y">
              {orders.map((po) => (
                <li key={po.id}>
                  <Link href={`/purchase-orders/${po.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{po.poNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(po.poDate)}
                        {po.expectedDeliveryDate ? ` · due ${formatDate(po.expectedDeliveryDate)}` : ""}
                      </div>
                    </div>
                    <POStatusBadge status={po.status} />
                    <span className="w-24 text-right font-medium tabular">{formatINR(po.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issues</CardTitle>
          <CardDescription>Short / excess quantity, quality rejections, late deliveries and document problems with this vendor.</CardDescription>
        </CardHeader>
        <CardContent>
          <IssueList issues={issues} canResolve={can(user.roles, "resolveIssue")} empty={range ? `No issues raised in ${range.span}.` : "No issues raised with this vendor."} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card className="gap-1.5">
      <CardHeader>
        <CardDescription className="font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight tabular",
            tone === "good" && "text-emerald-700 dark:text-emerald-400",
            tone === "warn" && "text-amber-700 dark:text-amber-400",
            tone === "bad" && "text-rose-600",
          )}
        >
          {value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
