import { BadgeCheckIcon, FileIcon, FileSpreadsheetIcon, FileTextIcon, ReceiptIndianRupeeIcon, TruckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A stored file shown as an icon that opens it (PO copy, bilty, invoice, certificate, quotation…). */
export type FileRef = { kind: "PO" | "BILTY" | "INVOICE" | "CERT" | "QUOTE" | "OTHER"; name: string; href: string };

export const FILE_KIND = {
  PO: { label: "PO copy", icon: FileTextIcon, tone: "text-sky-600 dark:text-sky-400" },
  BILTY: { label: "Bilty", icon: TruckIcon, tone: "text-amber-600 dark:text-amber-400" },
  INVOICE: { label: "Invoice", icon: ReceiptIndianRupeeIcon, tone: "text-emerald-600 dark:text-emerald-400" },
  CERT: { label: "Test certificate", icon: BadgeCheckIcon, tone: "text-violet-600 dark:text-violet-400" },
  QUOTE: { label: "Quotation", icon: FileSpreadsheetIcon, tone: "text-indigo-600 dark:text-indigo-400" },
  OTHER: { label: "Document", icon: FileIcon, tone: "text-muted-foreground" },
} as const;

/**
 * Files as small labelled chips (icon + what it is), for cards with room: a quotation is named by
 * its vendor (the part of `name` before " — "), so several quotes can be told apart at a glance.
 */
export function FileChips({ files, className }: { files: FileRef[]; className?: string }) {
  if (!files.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {files.map((f, i) => {
        const k = FILE_KIND[f.kind];
        const label = f.kind === "QUOTE" ? f.name.split(" — ")[0] : k.label;
        return (
          <a
            key={i}
            href={f.href}
            target="_blank"
            rel="noopener"
            title={`Open ${k.label.toLowerCase()}: ${f.name}`}
            className="inline-flex max-w-56 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <k.icon className={cn("size-3.5 shrink-0", k.tone)} />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </span>
  );
}

/** One icon per file; each opens the file in a new tab. `empty` shows when there are none. */
export function FileIcons({ files, empty = null, className }: { files: FileRef[]; empty?: React.ReactNode; className?: string }) {
  if (!files.length) return empty;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {files.map((f, i) => {
        const k = FILE_KIND[f.kind];
        return (
          <a
            key={i}
            href={f.href}
            target="_blank"
            rel="noopener"
            title={`${k.label}: ${f.name}`}
            aria-label={`${k.label}: ${f.name}`}
            className={cn("grid size-6 place-items-center rounded-md hover:bg-muted", k.tone)}
          >
            <k.icon className="size-4" />
          </a>
        );
      })}
    </span>
  );
}
