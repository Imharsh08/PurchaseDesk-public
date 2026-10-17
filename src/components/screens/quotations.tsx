import Link from "@/components/link";
import { ArrowRightIcon, ScaleIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { IndentStatusBadge, UrgentBadge } from "@/components/indent-status-badge";
import { DateRangeNotice } from "@/components/date-range-notice";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndentStatus } from "@/generated/prisma/enums";
import { ALL_DATES } from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { MIN_QUOTATIONS } from "@/lib/indent-status";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/lib/date-range";
import type { loadQuotationBoard } from "@/lib/screens/indents";

// Decisions waiting on someone first (approval, then POs to create), the longer collecting list last.
const SECTIONS: { status: IndentStatus; id: string; title: string; description: string }[] = [
  { status: "PENDING_APPROVAL", id: "awaiting-approval", title: "Awaiting approval", description: "Comparative statements waiting for a manager." },
  { status: "APPROVED", id: "approved", title: "Approved, PO not created", description: "Vendor selection approved; create the purchase orders." },
  { status: "OPEN", id: "collecting", title: "Collecting quotations", description: `Enter vendor quotes; at least ${MIN_QUOTATIONS} per indent.` },
];

type Data = NonNullable<Awaited<ReturnType<typeof loadQuotationBoard>>>;
export type QuotationsViewProps = Pick<Data, "indents"> & {
  range: DateRange | null;
};

export function QuotationsView({ indents, range }: QuotationsViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="Quotations" description="Indents moving through quotation, comparison and approval." />
      <DateRangeNotice value={range?.value ?? ALL_DATES} what="indents raised" />
      {indents.length === 0 ? (
        <Card>
          <EmptyState icon={ScaleIcon} title="Nothing in progress" description="Submitted indents appear here while quotations are collected and approved." />
        </Card>
      ) : (
        <>
          {/* Counts at the top, each a jump to its section. */}
          <nav className="flex flex-wrap gap-2" aria-label="Sections">
            {SECTIONS.map((section) => {
              const n = indents.filter((i) => i.status === section.status).length;
              return (
                <a
                  key={section.status}
                  href={`#${section.id}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    !n && "pointer-events-none opacity-50",
                    n > 0 && section.status === "PENDING_APPROVAL" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                  )}
                >
                  {section.title}
                  <span className="font-semibold tabular">{n}</span>
                </a>
              );
            })}
          </nav>
          {SECTIONS.map((section) => {
          const list = indents.filter((i) => i.status === section.status);
          if (!list.length) return null;
          return (
            <Card key={section.status} id={section.id} className="scroll-mt-20 gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>
                  {section.title} <span className="font-normal text-muted-foreground">({list.length})</span>
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <ul className="divide-y">
                {list.map((ind) => {
                  const n = ind.quotations.length;
                  return (
                    <li key={ind.id}>
                      <Link href={`/indents/${ind.id}${section.status === "OPEN" ? "#quotations" : "#comparison"}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{ind.indentNumber}</span>
                            <IndentStatusBadge status={ind.status} />
                            {ind.priority === "URGENT" && <UrgentBadge />}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            {ind.items.map((i) => i.description).join(", ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ind.requestedBy.name}
                            {ind.requiredBy ? ` · needed by ${formatDate(ind.requiredBy)}` : ""}
                            {n ? ` · ${ind.quotations.map((q) => q.vendor.name).join(", ")}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn("text-lg font-semibold tabular", section.status === "OPEN" && n < MIN_QUOTATIONS && "text-amber-600")}>
                            {n}
                            {section.status === "OPEN" && <span className="text-sm font-normal text-muted-foreground">/{MIN_QUOTATIONS}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">quotes</div>
                        </div>
                        <ArrowRightIcon className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
          })}
        </>
      )}
    </div>
  );
}
