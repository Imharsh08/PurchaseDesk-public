"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, Loader2Icon, UploadIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPORT_CHUNK, IMPORTS, matchColumns, type ImportKind } from "@/lib/import-spec";
import { cn } from "@/lib/utils";
import { importRows } from "./actions";

type Parsed = { fileName: string; rows: { row: number; values: Record<string, unknown> }[]; unknownHeaders: string[]; missing: string[] };
type Outcome = { created: number; updated: number; errors: { row: number; message: string }[] };

export function Importer() {
  const [kind, setKind] = useState<ImportKind>("items");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const spec = IMPORTS[kind];

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([spec.columns.map((c) => c.header), spec.columns.map((c) => c.example)]);
    sheet["!cols"] = spec.columns.map((c) => ({ wch: Math.max(12, c.header.length + 2) }));
    XLSX.utils.book_append_sheet(wb, sheet, spec.title);
    const help = XLSX.utils.aoa_to_sheet([
      ["Column", "Required", "Notes"],
      ...spec.columns.map((c) => [c.header, c.required ? "Yes" : "", c.help ?? ""]),
      [],
      [`Rows are matched on ${spec.matchOn}: existing records are updated, new ones added.`],
      ["Delete the example row before importing."],
    ]);
    help["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, help, "How to fill");
    XLSX.writeFile(wb, `PurchaseDesk ${spec.title} template.xlsx`);
  }

  async function onFile(file: File) {
    setOutcome(null);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (grid.length < 2) return void toast.error("The sheet has no data rows under the header.");
    const headers = (grid[0] as unknown[]).map((h) => String(h ?? ""));
    const keys = matchColumns(kind, headers);
    const rows = grid.slice(1).flatMap((cells, i) => {
      const values: Record<string, unknown> = {};
      keys.forEach((k, c) => {
        if (k) values[k] = (cells as unknown[])[c];
      });
      return Object.values(values).some((v) => String(v ?? "").trim() !== "") ? [{ row: i + 2, values }] : [];
    });
    setParsed({
      fileName: file.name,
      rows,
      unknownHeaders: headers.filter((h, i) => h && !keys[i]),
      missing: spec.columns.filter((c) => c.required && !keys.includes(c.key)).map((c) => c.header),
    });
  }

  const rowIssues = (values: Record<string, unknown>) =>
    spec.columns.filter((c) => c.required && String(values[c.key] ?? "").trim() === "").map((c) => `${c.header} is empty`);

  function runImport() {
    if (!parsed) return;
    start(async () => {
      const total: Outcome = { created: 0, updated: 0, errors: [] };
      for (let i = 0; i < parsed.rows.length; i += IMPORT_CHUNK) {
        setProgress(`Importing rows ${i + 1}–${Math.min(i + IMPORT_CHUNK, parsed.rows.length)} of ${parsed.rows.length}…`);
        const result = await importRows(kind, parsed.rows.slice(i, i + IMPORT_CHUNK)).catch(() => ({
          ok: false as const,
          error: "Couldn't reach the server. Rows imported so far are saved; import the file again to finish.",
        }));
        if (!result.ok) {
          toast.error(result.error);
          break;
        }
        total.created += result.data.created;
        total.updated += result.data.updated;
        total.errors.push(...result.data.errors);
      }
      setProgress(null);
      setOutcome(total);
      if (total.errors.length) toast.warning(`${total.errors.length} row${total.errors.length === 1 ? "" : "s"} could not be imported`);
      else toast.success("Import complete");
    });
  }

  const preview = parsed?.rows.slice(0, 50) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(IMPORTS) as ImportKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setParsed(null);
              setOutcome(null);
            }}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:border-primary/40",
              kind === k ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "bg-card",
            )}
          >
            <div className="font-medium">{IMPORTS[k].title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{IMPORTS[k].description}</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import {spec.title.toLowerCase()}</CardTitle>
          <CardDescription>
            1. Download the template · 2. Fill it in Excel (keep the header row) · 3. Upload it, check the preview, import. Rows are matched on{" "}
            <strong>{spec.matchOn}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <DownloadIcon />
            Download template
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={pending}>
            <UploadIcon />
            Upload filled file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <span className="self-center text-xs text-muted-foreground">.xlsx, .xls or .csv · first sheet is read</span>
        </CardContent>
      </Card>

      {parsed && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <FileSpreadsheetIcon className="size-4" />
              {parsed.fileName}
              <Badge variant="outline">{parsed.rows.length} rows</Badge>
            </CardTitle>
            {(parsed.missing.length > 0 || parsed.unknownHeaders.length > 0) && (
              <CardDescription>
                {parsed.missing.length > 0 && <span className="text-destructive">Missing required columns: {parsed.missing.join(", ")}. </span>}
                {parsed.unknownHeaders.length > 0 && <span>Ignored columns: {parsed.unknownHeaders.join(", ")}.</span>}
              </CardDescription>
            )}
          </CardHeader>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-4">Row</th>
                  {spec.columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 whitespace-nowrap">
                      {c.header}
                    </th>
                  ))}
                  <th className="px-2 py-2 pr-4">Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => {
                  const issues = rowIssues(r.values);
                  const serverError = outcome?.errors.find((e) => e.row === r.row);
                  return (
                    <tr key={r.row} className={cn("border-t", (issues.length || serverError) && "bg-rose-50/70 dark:bg-rose-950/20")}>
                      <td className="py-1.5 pl-4 text-muted-foreground tabular">{r.row}</td>
                      {spec.columns.map((c) => (
                        <td key={c.key} className="max-w-48 truncate px-2 py-1.5">
                          {String(r.values[c.key] ?? "")}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 pr-4 text-xs">
                        {issues.length || serverError ? (
                          <span className="text-destructive">{serverError?.message ?? issues.join(", ")}</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsed.rows.length > preview.length && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing the first {preview.length} of {parsed.rows.length} rows.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
            {outcome && (
              <span className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-4" />
                  {outcome.created} added, {outcome.updated} updated
                </span>
                {outcome.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircleIcon className="size-4" />
                    {outcome.errors.length} rejected (see the Check column)
                  </span>
                )}
              </span>
            )}
            <Button className="ml-auto" onClick={runImport} disabled={pending || parsed.missing.length > 0 || parsed.rows.length === 0}>
              {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              Import {parsed.rows.length} rows
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
