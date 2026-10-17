import { ChevronDownIcon } from "lucide-react";
import Link from "@/components/link";
import { PAGE_SIZE, moreHref } from "@/lib/list-limit";
import { cn } from "@/lib/utils";

/** Under a long list: "Showing 50 of 312 · Show 50 more". Nothing when every row is shown. */
export function ShowMore({
  shown,
  total,
  path,
  searchParams,
  limit,
  className,
}: {
  shown: number;
  total: number;
  path: string;
  searchParams: Record<string, string | string[] | undefined>;
  limit: number;
  className?: string;
}) {
  if (shown >= total) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-4 py-3 text-sm", className)}>
      <span className="text-muted-foreground tabular">
        Showing {shown} of {total}
      </span>
      <Link
        href={moreHref(path, searchParams, limit)}
        scroll={false}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/10"
      >
        Show {Math.min(PAGE_SIZE, total - shown)} more
        <ChevronDownIcon className="size-4" />
      </Link>
    </div>
  );
}
