import Link from "@/components/link";
import { AlertTriangleIcon, BoxesIcon, ClipboardListIcon, HourglassIcon, PackageIcon, PencilLineIcon, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { can } from "@/lib/roles";
import { NEAR_MIN_FACTOR, STALE_DAYS, STOCK_STATUS } from "@/lib/stock";
import type { StockRow } from "@/lib/stock-data";
import { cn } from "@/lib/utils";
import { StockTable } from "@/app/(app)/stock/stock-table";
import type { ScreenUser, SearchParams } from "@/components/screens/types";

const VIEWS: { key: string; label: string; filter?: (r: StockRow) => boolean }[] = [
  { key: "all", label: "All items" },
  { key: "order", label: "Needs order", filter: (r) => r.position.suggested > 0 },
  { key: "below", label: "Below minimum", filter: (r) => r.position.status === "OUT" || r.position.status === "BELOW_MIN" },
  { key: "stale", label: `Not counted in ${STALE_DAYS} days`, filter: (r) => r.stale },
  { key: "setup", label: "Minimum not set", filter: (r) => r.minStock === null },
];

const SORTS: Record<string, (a: StockRow, b: StockRow) => number> = {
  // Most critical first: status, then lowest stock relative to minimum
  critical: (a, b) =>
    STOCK_STATUS[a.position.status].rank - STOCK_STATUS[b.position.status].rank || a.position.ratio - b.position.ratio,
  // Largest minimum qty first
  min: (a, b) => (b.minStock ?? -1) - (a.minStock ?? -1),
  stock: (a, b) => (a.current ?? Infinity) - (b.current ?? Infinity),
  name: (a, b) => a.name.localeCompare(b.name),
  updated: (a, b) => (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0),
};

export type StockViewProps = {
  all: StockRow[];
  sp: SearchParams;
  user: ScreenUser;
};

export function StockView({ all, sp, user }: StockViewProps) {
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const sort = typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "critical";
  const rows = (view.filter ? all.filter(view.filter) : all).sort((a, b) => SORTS[sort](a, b) || a.name.localeCompare(b.name));

  const count = (f?: (r: StockRow) => boolean) => (f ? all.filter(f).length : all.length);
  const hrefFor = (v: string, s = sort) => {
    const p = new URLSearchParams();
    if (v !== "all") p.set("view", v);
    if (s !== "critical") p.set("sort", s);
    return `/stock${p.size ? `?${p}` : ""}`;
  };
  const sortHref = Object.fromEntries(Object.keys(SORTS).map((s) => [s, hrefFor(view.key, s)]));
  const tracked = all.filter((r) => r.minStock !== null).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description={`Latest counted stock against minimum levels. Near minimum = within ${Math.round((NEAR_MIN_FACTOR - 1) * 100)}% above it.`}
        actions={
          can(user.roles, "updateStock") && (
            <Button asChild>
              <Link href="/stock/update">
                <PencilLineIcon />
                Update stock
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={AlertTriangleIcon} label="Below minimum" value={count(VIEWS[2].filter)} href={hrefFor("below")} tone="warn" />
        <Kpi icon={ClipboardListIcon} label="To order" value={count(VIEWS[1].filter)} href={hrefFor("order")} sub="After open indents & POs" />
        <Kpi icon={HourglassIcon} label={`Not counted in ${STALE_DAYS} days`} value={count(VIEWS[3].filter)} href={hrefFor("stale")} />
        <Kpi icon={PackageIcon} label="Items with a minimum" value={tracked} sub={`of ${all.length} active items`} href={hrefFor("setup")} />
      </div>

      <Card className="gap-0 py-0">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-3" aria-label="Filter stock">
          {VIEWS.map((v) => {
            const active = v.key === view.key;
            return (
              <Link
                key={v.key}
                href={hrefFor(v.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-sm transition-colors",
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
                <span className={cn("rounded-full px-1.5 py-px text-[11px] tabular", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {count(v.filter)}
                </span>
              </Link>
            );
          })}
        </nav>
        {rows.length === 0 ? (
          <EmptyState
            icon={BoxesIcon}
            title={all.length === 0 ? "No items yet" : "Nothing here"}
            description={
              all.length === 0
                ? "Add items with a minimum stock and pack size, then count stock."
                : view.key === "order"
                  ? "No items need ordering right now."
                  : "No items match this view."
            }
            action={
              all.length === 0 ? (
                <Button asChild>
                  <Link href="/items">Go to items</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <StockTable rows={rows} sort={sort} sortHref={sortHref} canIndent={can(user.roles, "raiseIndent")} />
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, href, tone }: { icon: LucideIcon; label: string; value: number; sub?: string; href: string; tone?: "warn" }) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Card className={cn("h-full gap-2 transition-shadow hover:shadow-md", tone === "warn" && value > 0 && "ring-amber-400/60")}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardDescription className="font-medium">{label}</CardDescription>
          <span className={cn("grid size-8 place-items-center rounded-md", tone === "warn" && value > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-primary/8 text-primary")}>
            <Icon className="size-4" />
          </span>
        </CardHeader>
        <CardContent>
          <div className="figure text-2xl font-semibold">{value}</div>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}
