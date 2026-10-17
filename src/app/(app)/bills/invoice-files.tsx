"use client";

import { useOptimistic, useRef } from "react";
import { FileTextIcon, Loader2Icon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { attachBillInvoice, removeBillInvoice } from "./actions";

export type InvoiceFile = { id: number; fileName: string; size: number; addedOn: string };
type Shown = InvoiceFile & { uploading?: boolean };
type Change = { add: Shown } | { remove: number };

/** The vendor's invoice copy for a goods receipt: attach while entering the bill, or later on the bill page. */
export function InvoiceFiles({ grnId, files, canEdit }: { grnId: number; files: InvoiceFile[]; canEdit: boolean }) {
  const [pending, run] = useServerAction();
  // A picked file shows at once; a removed one disappears at once. The server's list replaces this.
  const [shown, change] = useOptimistic<Shown[], Change>(files, (cur, c) => ("add" in c ? [...cur, c.add] : cur.filter((f) => f.id !== c.remove)));
  const input = useRef<HTMLInputElement>(null);

  function attach(file: File) {
    const data = new FormData();
    data.set("file", file);
    run(
      async () => {
        change({ add: { id: -Date.now(), fileName: file.name, size: file.size, addedOn: "uploading…", uploading: true } });
        const result = await attachBillInvoice(grnId, data);
        if (input.current) input.current.value = "";
        return result;
      },
      { success: "Invoice attached" },
    );
  }

  function remove(f: InvoiceFile) {
    run(
      async () => {
        change({ remove: f.id });
        return removeBillInvoice(f.id);
      },
      { success: `${f.fileName} removed` },
    );
  }

  return (
    <div className="space-y-2">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoice copy attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((f) => (
            <li key={f.id} className={cn("flex items-center gap-3 rounded-lg border p-2.5", f.uploading && "opacity-60")}>
              {f.uploading ? <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />}
              <a href={f.uploading ? undefined : `/api/documents/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <div className="truncate text-sm hover:text-primary hover:underline">{f.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {(f.size / 1024).toFixed(0)} KB · {f.addedOn}
                </div>
              </a>
              {canEdit && !f.uploading && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.fileName}`} className="text-muted-foreground hover:text-destructive" onClick={() => remove(f)}>
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
            Attach invoice copy
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
          />
          <p className="text-xs text-muted-foreground">PDF or photo, up to 5 MB. Saved on the goods receipt, so it also shows on the receipt and PO.</p>
        </>
      )}
    </div>
  );
}
