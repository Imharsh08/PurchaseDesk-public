import Link from "@/components/link";
import { AlertTriangleIcon, ClipboardCheckIcon, FlagIcon, PackageCheckIcon, TruckIcon, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ShowMore } from "@/components/show-more";
import { DateRangeNotice } from "@/components/date-range-notice";
import { POStatusBadge } from "@/components/po-status-badge";
import { IssueList } from "@/components/vendor-issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ALL_DATES } from "@/lib/date-range";
import { GRN_VIEWS } from "@/lib/screens/options";
import { formatDate, formatQty } from "@/lib/format";
import { GRN_STATUS } from "@/lib/grn-labels";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadGoodsReceiptsScreen } from "@/lib/screens/goods-receipts";

const VIEWS = GRN_VIEWS;

type Data = NonNullable<Awaited<ReturnType<typeof loadGoodsReceiptsScreen>>>;
export type GoodsReceiptsViewProps = Pick<Data, "awaiting" | "issues" | "openIssues" | "overdue" | "pendingCount" | "receiptTotal" | "view"> & {
  canReceive: boolean;
  grns: Data["receipts"];
  limit: number;
  range: DateRange | null;
  sp: SearchParams;
  user: ScreenUser;
};

export function GoodsReceiptsView({ awaiting, canReceive, grns, issues, limit, openIssues, overdue, pendingCount, range, receiptTotal, sp, user, view }: GoodsReceiptsViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods receipt"
        description="Receive material against purchase orders, check quantity & quality, and attach invoice and bilty."
      />
      <DateRangeNotice value={range?.value ?? ALL_DATES} what={view === "awaiting" ? "open POs" : view === "issues" ? "issues" : "receipts"} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={TruckIcon} label="POs awaiting delivery" value={awaiting.length} href="/goods-receipts" />
        <Kpi icon={AlertTriangleIcon} label="Past delivery date" value={overdue} href="/goods-receipts" warn={overdue > 0} />
        <Kpi icon={ClipboardCheckIcon} label="Pending quality check" value={pendingCount} href="/goods-receipts?view=pending" warn={pendingCount > 0} />
        <Kpi icon={FlagIcon} label="Open vendor issues" value={openIssues} href="/goods-receipts?view=issues" warn={openIssues > 0} />
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "awaiting" ? "/goods-receipts" : `/goods-receipts?view=${v.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {v.label}
              {v.key === "pending" && pendingCount > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendingCount}</span>}
              {v.key === "issues" && openIssues > 0 && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{openIssues}</span>}
            </Link>
          ))}
        </div>

        {view === "issues" ? (
          <div className="p-4">
            <IssueList
              issues={issues}
              canResolve={can(user.roles, "resolveIssue")}
              empty="No open vendor issues."
            />
            <ShowMore shown={issues.length} total={openIssues} path="/goods-receipts" searchParams={sp} limit={limit} className="mt-4 border-t-0" />
          </div>
        ) : view === "awaiting" ? (
          awaiting.length === 0 ? (
            <EmptyState icon={TruckIcon} title="Nothing awaited" description="Issued POs with quantity still to come appear here." />
          ) : (
            <ul className="divide-y">
              {awaiting.map((po) => (
                <li key={po.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:text-primary hover:underline">
                        {po.poNumber}
                      </Link>
                      <POStatusBadge status={po.status} />
                      {po._count.goodsReceipts > 0 && (
                        <Badge className={cn("border-transparent", GRN_STATUS.PENDING_QC.tone)}>{po._count.goodsReceipts} awaiting check</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Link href={`/vendors/${po.vendor.id}`} className="hover:text-foreground">
                        {po.vendor.name}
                      </Link>
                      {" · "}
                      {po.lines
                        .slice(0, 3)
                        .map((l) => `${l.description} ${formatQty(l.pending)} ${l.uom}`)
                        .join(", ")}
                      {po.lines.length > 3 ? ` +${po.lines.length - 3} more` : ""}
                    </div>
                  </div>
                  <div className="text-sm sm:w-40 sm:text-right">
                    {po.expectedDeliveryDate ? (
                      <>
                        <div className={cn(po.overdueDays! > 0 && "font-medium text-destructive")}>
                          {po.overdueDays! > 0 ? `${po.overdueDays}d late` : po.overdueDays === 0 ? "Due today" : `Due ${formatDate(po.expectedDeliveryDate)}`}
                        </div>
                        {po.overdueDays! > 0 && <div className="text-xs text-muted-foreground">due {formatDate(po.expectedDeliveryDate)}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No due date</span>
                    )}
                  </div>
                  {canReceive && (
                    <Button size="sm" asChild>
                      <Link href={`/goods-receipts/new?po=${po.id}`}>
                        <PackageCheckIcon />
                        Receive
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : grns.length === 0 ? (
          <EmptyState icon={ClipboardCheckIcon} title={view === "pending" ? "Nothing waiting for a check" : "No receipts yet"} description="Receipts are created with “Receive” on an issued PO." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 pl-4">Receipt</th>
                  <th className="py-2.5 pr-3">Vendor</th>
                  <th className="py-2.5 pr-3">Invoice</th>
                  <th className="py-2.5 pr-3">Items received</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-4">Received by</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="py-3 pl-4">
                      <Link href={`/goods-receipts/${g.id}`} className="font-medium hover:text-primary hover:underline">
                        {g.grnNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(g.receivedAt)} ·{" "}
                        <Link href={`/purchase-orders/${g.po.id}`} className="hover:text-foreground">
                          {g.po.poNumber}
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <Link href={`/vendors/${g.vendor.id}`} className="hover:text-primary">
                        {g.vendor.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">
                      {g.invoiceNo ?? <span className="text-muted-foreground">—</span>}
                      <div className="text-xs text-muted-foreground">
                        {g._count.documents ? `${g._count.documents} document${g._count.documents === 1 ? "" : "s"}` : "No documents"}
                        {g.biltyNo ? ` · LR ${g.biltyNo}` : ""}
                      </div>
                    </td>
                    <td className="max-w-80 py-3 pr-3">
                      {g.items.map((l, i) => (
                        <div key={i} className="truncate" title={l.poItem.description}>
                          {l.poItem.description}{" "}
                          <span className="text-muted-foreground tabular">
                            {formatQty(l.acceptedQty ?? l.receivedQty)} {l.poItem.uom}
                            {l.acceptedQty !== null && formatQty(l.acceptedQty) !== formatQty(l.receivedQty) ? ` of ${formatQty(l.receivedQty)}` : ""}
                          </span>
                        </div>
                      ))}
                      {g._count.items > g.items.length && <div className="text-xs text-muted-foreground">+{g._count.items - g.items.length} more</div>}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge className={cn("border-transparent", GRN_STATUS[g.status].tone)}>{GRN_STATUS[g.status].label}</Badge>
                      {g._count.issues > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-rose-600">
                          <FlagIcon className="size-3" />
                          {g._count.issues}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{g.receivedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ShowMore shown={grns.length} total={receiptTotal} path="/goods-receipts" searchParams={sp} limit={limit} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, href, warn }: { icon: LucideIcon; label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Card className={cn("h-full gap-2 transition-shadow hover:shadow-md", warn && "ring-amber-400/60")}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardDescription className="font-medium">{label}</CardDescription>
          <Icon className={cn("size-4", warn ? "text-amber-600" : "text-primary")} />
        </CardHeader>
        <CardContent className="figure text-2xl font-semibold">{value}</CardContent>
      </Card>
    </Link>
  );
}
