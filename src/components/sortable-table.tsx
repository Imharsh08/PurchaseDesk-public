"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortValue = string | number | boolean | null;

export type SortColumn = {
  key: string;
  label: React.ReactNode;
  /** Classes for both the header and the cells (padding, alignment). */
  className?: string;
  /** Numbers sort largest first on the first click; text A→Z. */
  numeric?: boolean;
  sortable?: boolean;
};

export type SortRow = {
  key: string | number;
  /** Value per sortable column key. */
  sort: Record<string, SortValue>;
  /** Cell content per column key. */
  cells: Record<string, React.ReactNode>;
};

type Sort = { key: string; dir: "asc" | "desc" } | null;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

function readSort(p: URLSearchParams, columns: SortColumn[]): Sort {
  const key = p.get("sort");
  const dir = p.get("dir");
  return key && columns.some((c) => c.key === key && c.sortable !== false) ? { key, dir: dir === "desc" ? "desc" : "asc" } : null;
}

/**
 * Table whose column headers sort the rows in the browser (instant, no server round trip).
 * Rows keep the server's order until a header is clicked; empty values always go last.
 * The sort is kept in the URL (?sort=…&dir=…) so a refresh or a shared link shows the same order.
 */
export function SortableTable({ columns, rows, className }: { columns: SortColumn[]; rows: SortRow[]; className?: string }) {
  // Same on the server and in the browser, so the first render matches.
  const params = useSearchParams();
  const [sort, setSort] = useState<Sort>(() => readSort(params, columns));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return rows.toSorted((ra, rb) => {
      const a = ra.sort[sort.key] ?? null;
      const b = rb.sort[sort.key] ?? null;
      const emptyA = a === null || a === "";
      const emptyB = b === null || b === "";
      if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
      return compare(a, b) * sign;
    });
  }, [rows, sort]);

  function toggle(col: SortColumn) {
    const next: Sort =
      sort?.key === col.key ? { key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: col.numeric ? "desc" : "asc" };
    setSort(next);
    // Keep the order in the address bar without asking the server for the page again.
    const url = new URL(window.location.href);
    url.searchParams.set("sort", next.key);
    url.searchParams.set("dir", next.dir);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          {columns.map((col) => {
            const active = sort?.key === col.key;
            if (col.sortable === false) return <TableHead key={col.key} className={col.className}>{col.label}</TableHead>;
            const Icon = !active ? ArrowUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
            return (
              <TableHead key={col.key} className={col.className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  onClick={() => toggle(col)}
                  className={cn(
                    "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active && "text-foreground",
                  )}
                >
                  {col.label}
                  <Icon className={cn("size-3.5 shrink-0", !active && "opacity-40")} aria-hidden />
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.key}>
            {columns.map((col) => (
              <TableCell key={col.key} className={col.className}>
                {row.cells[col.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
