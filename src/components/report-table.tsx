"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "@/components/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { FILE_KIND, FileIcons, type FileRef } from "@/components/file-icons";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Column = { key: string; label: string; type?: "text" | "number" | "money" | "date" | "pct" | "files" };
export type RowFile = FileRef;
/** Rows shown under a row when it is expanded (e.g. a PO's deliveries). */
export type SubTable = { title: string; columns: Column[]; rows: Row[] };
export type Row = Record<string, string | number | null | undefined | RowFile[] | SubTable> & { _href?: string | null };

const subOf = (r: Row) => {
  const v = r._sub;
  return v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? v : null;
};


const isNumeric = (type: Column["type"]) => type === "number" || type === "money" || type === "pct";

const files = (v: Row[string]) => (Array.isArray(v) ? v : []);
/** A cell's own value (a sub-table is not one). */
const plain = (v: Row[string]) => (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? null : v);

/** "PO copy, Bilty, Invoice ×2" for search and Excel. */
function filesText(v: Row[string]) {
  const counts = new Map<RowFile["kind"], number>();
  for (const f of files(v)) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${FILE_KIND[k].label}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}

/** One icon per attached file; each opens the file. */
function FileIconsCell({ value }: { value: Row[string] }) {
  return <FileIcons files={files(value)} empty={<span className="text-muted-foreground">—</span>} />;
}

function display(raw: Row[string], type: Column["type"]) {
  if (type === "files") return filesText(raw) || "—";
  const value = plain(raw);
  if (value === null || value === undefined || value === "" || Array.isArray(value)) return "—";
  if (type === "money") return formatAmount(Number(value));
  if (type === "number") return formatQty(Number(value));
  if (type === "pct") return `${formatQty(Number(value))}%`;
  if (type === "date") return formatDate(String(value));
  return String(value);
}

/** An expanded row's detail: a small table under it (e.g. each delivery of a PO). */
function SubRows({ sub, span }: { sub: SubTable; span: number }) {
  return (
    <tr className="bg-muted/30">
      <td colSpan={span} className="px-4 pt-0 pb-2">
        <div className="ml-5 overflow-x-auto rounded-md border bg-card">
          <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">{sub.title}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                {sub.columns.map((c) => (
                  <th key={c.key} className={cn("px-3 py-1 font-medium whitespace-nowrap", isNumeric(c.type) && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sub.rows.map((sr, si) => (
                <tr key={si} className="border-t">
                  {sub.columns.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-1", isNumeric(c.type) && "text-right tabular", c.key === "items" ? "max-w-80" : "whitespace-nowrap")}>
                      {c.type === "files" ? (
                        <FileIconsCell value={sr[c.key]} />
                      ) : i === 0 && sr._href ? (
                        <Link href={sr._href} className="font-medium hover:text-primary hover:underline">
                          {display(sr[c.key], c.type)}
                        </Link>
                      ) : (
                        display(sr[c.key], c.type)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

/** Sortable, searchable table with "Export to Excel". */
export function ReportTable({
  columns,
  rows,
  totals,
  fileName,
  note,
}: {
  columns: Column[];
  rows: Row[];
  totals?: Row;
  fileName: string;
  note?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const keyOf = (r: Row, i: number) => r._href ?? String(i);
  const toggle = (k: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const text = (r: Row, c: Column) => (c.type === "files" ? `${filesText(r[c.key])} ${files(r[c.key]).map((f) => f.name).join(" ")}` : String(plain(r[c.key]) ?? ""));
    let list = q ? rows.filter((r) => columns.some((c) => text(r, c).toLowerCase().includes(q))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      list = [...list].sort((a, b) => {
        // Files sort by how many are attached.
        const x = col?.type === "files" ? files(a[sort.key]).length : plain(a[sort.key]);
        const y = col?.type === "files" ? files(b[sort.key]).length : plain(b[sort.key]);
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        const numeric = isNumeric(col?.type);
        const cmp = numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y));
        return cmp * sort.dir;
      });
    }
    return list;
  }, [rows, columns, query, sort]);

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const value = (raw: Row[string], type: Column["type"]) => {
      const v = plain(raw);
      return type === "files" ? filesText(raw) : v === null || v === undefined ? "" : type === "date" ? new Date(String(v)) : isNumeric(type) ? Number(v) : String(v);
    };
    const data = [
      columns.map((c) => c.label),
      ...shown.map((r) => columns.map((c) => value(r[c.key], c.type))),
      ...(totals ? [columns.map((c) => value(totals[c.key], c.type))] : []),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true, dateNF: "dd-mmm-yyyy" });
    sheet["!cols"] = columns.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Report");
    // Expanded detail (e.g. each delivery of a PO) on a second sheet, with its row's first column.
    const withSub = shown.filter((r) => subOf(r));
    if (withSub.length) {
      const sub = subOf(withSub[0])!;
      const detail = [
        [columns[0].label, ...sub.columns.map((c) => c.label)],
        ...withSub.flatMap((r) => subOf(r)!.rows.map((sr) => [value(r[columns[0].key], columns[0].type), ...sub.columns.map((c) => value(sr[c.key], c.type))])),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail, { cellDates: true, dateNF: "dd-mmm-yyyy" }), "Details");
    }
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  return (
    <div className="isolate min-w-0">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter rows" aria-label="Filter rows" />
        </InputGroup>
        <span className="text-sm text-muted-foreground">
          {shown.length} of {rows.length} rows
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportExcel} disabled={!rows.length}>
          <DownloadIcon />
          Export to Excel
        </Button>
      </div>
      {note && <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{note}</p>}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-left text-xs text-muted-foreground">
              {columns.map((c, i) => {
                const numeric = isNumeric(c.type);
                return (
                  <th key={c.key} className={cn("px-3 py-2 font-medium whitespace-nowrap", i === 0 && "pl-4", numeric && "text-right")}>
                    <button
                      type="button"
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", sort?.key === c.key && "text-foreground")}
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: numeric ? -1 : 1 }))}
                    >
                      {c.label}
                      {sort?.key === c.key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => {
              const sub = subOf(r);
              const k = keyOf(r, ri);
              const expanded = !!sub && open.has(k);
              return (
                <Fragment key={k}>
                  <tr className={cn("border-t hover:bg-muted/40", expanded && "bg-muted/30")}>
                    {columns.map((c, i) => {
                      const numeric = isNumeric(c.type);
                      const text = display(r[c.key], c.type);
                      const negative = numeric && Number(plain(r[c.key])) < 0;
                      return (
                        <td key={c.key} className={cn("px-3 py-1.5 whitespace-nowrap", i === 0 && "pl-4 font-medium", numeric && "text-right tabular", negative && "text-rose-600")}>
                          {i === 0 && sub && (
                            <button
                              type="button"
                              onClick={() => toggle(k)}
                              aria-expanded={expanded}
                              aria-label={expanded ? "Hide details" : `Show ${sub.title}`}
                              title={sub.title}
                              className="mr-1 -ml-1 inline-grid size-5 place-items-center rounded align-middle text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ChevronRightIcon className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                            </button>
                          )}
                          {c.type === "files" ? (
                            <FileIconsCell value={r[c.key]} />
                          ) : i === 0 && r._href ? (
                            <Link href={r._href} className="hover:text-primary hover:underline">
                              {text}
                            </Link>
                          ) : (
                            text
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {expanded && <SubRows sub={sub} span={columns.length} />}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                  No data for this period.
                </td>
              </tr>
            )}
          </tbody>
          {totals && shown.length > 0 && (
            <tfoot className="sticky bottom-0 bg-muted font-semibold">
              <tr className="border-t">
                {columns.map((c, i) => {
                  const numeric = isNumeric(c.type);
                  const v = totals[c.key];
                  return (
                    <td key={c.key} className={cn("px-3 py-2 whitespace-nowrap", i === 0 && "pl-4", numeric && "text-right tabular")}>
                      {v === undefined || v === null ? "" : display(v, c.type)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
