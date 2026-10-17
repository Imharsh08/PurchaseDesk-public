import Link from "@/components/link";
import { ClipboardListIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { IndentStatusBadge, UrgentBadge } from "@/components/indent-status-badge";
import { PageHeader } from "@/components/page-header";
import { ShowMore } from "@/components/show-more";
import { DateRangeNotice } from "@/components/date-range-notice";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_DATES } from "@/lib/date-range";
import { INDENT_TABS } from "@/lib/screens/options";
import { formatDate } from "@/lib/format";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { ScreenUser, SearchParams } from "@/components/screens/types";
import type { DateRange } from "@/lib/date-range";
import type { loadIndentList } from "@/lib/screens/indents";

type Data = NonNullable<Awaited<ReturnType<typeof loadIndentList>>>;
export type IndentsViewProps = Pick<Data, "indents" | "tabCounts"> & {
  limit: number;
  query: string;
  range: DateRange | null;
  sp: SearchParams;
  tabKey: string;
  user: ScreenUser;
};

export function IndentsView({ indents, limit, query, range, sp, tabCounts, tabKey, user }: IndentsViewProps) {
  const tab = INDENT_TABS.find((t) => t.key === tabKey)!;
  const hrefFor = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "all") p.set("status", key);
    if (query) p.set("q", query);
    return `/indents${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Indents"
        description="Material requirements. Each needs at least three quotations and an approved vendor before a PO is raised."
        actions={
          can(user.roles, "raiseIndent") && (
            <Button asChild>
              <Link href="/indents/new">
                <PlusIcon />
                New indent
              </Link>
            </Button>
          )
        }
      />
      <DateRangeNotice value={range?.value ?? ALL_DATES} what="indents raised" />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b px-4 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Filter by status">
            {INDENT_TABS.map((t) => {
              const active = t.key === tab.key;
              const count = tabCounts[t.key];
              return (
                <Link
                  key={t.key}
                  href={hrefFor(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-sm transition-colors",
                    active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span className={cn("rounded-full px-1.5 py-px text-[11px] tabular", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {count}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="pb-3">
            <SearchInput placeholder="Indent no., item, department" />
          </div>
        </div>

        {indents.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title={query ? "No indents match your search" : "No indents here yet"}
            description={query ? "Try an indent number, item name or department." : "Raise an indent when material is short or required."}
            action={
              !query && tab.key === "all" && can(user.roles, "raiseIndent") ? (
                <Button asChild>
                  <Link href="/indents/new">
                    <PlusIcon />
                    New indent
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Indent</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Required by</TableHead>
                <TableHead className="text-center">Quotes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Raised by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {indents.map((ind) => {
                const quotesShort = ind.status === "OPEN" && ind._count.quotations < MIN_QUOTATIONS;
                return (
                  <TableRow key={ind.id} className="group relative">
                    <TableCell className="pl-4">
                      <Link href={`/indents/${ind.id}`} className="font-medium after:absolute after:inset-0 group-hover:text-primary">
                        {ind.indentNumber}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {formatDate(ind.createdAt)}
                        {ind.priority === "URGENT" && <UrgentBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <div className="truncate">{ind.items[0]?.description ?? "—"}</div>
                      {ind.items.length > 1 && <div className="text-xs text-muted-foreground">+{ind.items.length - 1} more</div>}
                    </TableCell>
                    <TableCell className="text-sm">{ind.department ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatDate(ind.requiredBy)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn("tabular", quotesShort && "font-medium text-amber-700 dark:text-amber-400")}>
                        {ind._count.quotations}
                        {ind.status === "OPEN" && <span className="text-muted-foreground">/{MIN_QUOTATIONS}</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <IndentStatusBadge status={ind.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-sm text-muted-foreground">{ind.requestedBy.name}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <ShowMore shown={indents.length} total={tabCounts[tab.key]} path="/indents" searchParams={sp} limit={limit} />
      </Card>
    </div>
  );
}
