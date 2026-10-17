"use client";

import { useOptimistic, useRef, useState } from "react";
import { ArchiveIcon, BanIcon, FileIcon, Loader2Icon, PaperclipIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DocumentType, GrnStatus } from "@/generated/prisma/enums";
import { useLiveStatus } from "@/components/live-status";
import { useServerAction } from "@/hooks/use-server-action";
import { DOCUMENT_LABEL } from "@/lib/grn-labels";
import { cn } from "@/lib/utils";
import { cancelGoodsReceipt, deleteGrnDocument, markStored, recordReturn, uploadGrnDocument } from "../actions";

export type GrnDocument = { id: number; type: string; fileName: string; size: number; createdAt: string; by: string | null };

const UPLOAD_TYPES: DocumentType[] = ["INVOICE", "BILTY", "QUALITY_CERT", "OTHER"];

type DocRow = GrnDocument & { uploading?: boolean };
type DocChange = { add: DocRow } | { remove: number };

export function GrnDocuments({ grnId, documents, canUpload }: { grnId: number; documents: GrnDocument[]; canUpload: boolean }) {
  const [pending, run] = useServerAction();
  // Uploads show at once and removed files disappear at once; the server's list replaces this when it arrives.
  const [rows, change] = useOptimistic<DocRow[], DocChange>(documents, (current, c) =>
    "add" in c ? [...current, c.add] : current.filter((d) => d.id !== c.remove),
  );
  const [type, setType] = useState<DocumentType>(() => (documents.some((d) => d.type === "INVOICE") ? "BILTY" : "INVOICE"));
  const input = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const data = new FormData();
    data.set("file", file);
    const docType = type;
    run(
      async () => {
        change({ add: { id: -Date.now(), type: docType, fileName: file.name, size: file.size, createdAt: "uploading…", by: null, uploading: true } });
        const result = await uploadGrnDocument(grnId, docType, data);
        if (input.current) input.current.value = "";
        return result;
      },
      { success: `${DOCUMENT_LABEL[docType]} attached` },
    );
  }

  function remove(d: GrnDocument) {
    run(
      async () => {
        change({ remove: d.id });
        return deleteGrnDocument(d.id);
      },
      { success: `${d.fileName} removed` },
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoice or bilty attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id} className={cn("group flex items-center gap-3 rounded-lg border p-2.5", d.uploading && "opacity-60")}>
              {d.uploading ? (
                <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <a href={d.uploading ? undefined : `/api/documents/${d.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground">{DOCUMENT_LABEL[d.type] ?? d.type}</div>
                <div className="truncate text-sm hover:text-primary hover:underline">{d.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {(d.size / 1024).toFixed(0)} KB · {d.createdAt}
                  {d.by ? ` · ${d.by}` : ""}
                </div>
              </a>
              {canUpload && !d.uploading && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.fileName}`} onClick={() => remove(d)}>
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
            <SelectTrigger className="w-40" aria-label="Document type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPLOAD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="flex-1" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
            Attach
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      )}
    </div>
  );
}

export function CancelGrnButton({ grnId, grnNumber }: { grnId: number; grnNumber: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useServerAction();
  const live = useLiveStatus<GrnStatus>("PENDING_QC");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <BanIcon />
        Cancel receipt
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancel ${grnNumber}?`}
        description="Use this if the receipt was entered by mistake or the whole lot was returned before checking. Nothing is added to stock."
        label="Reason"
        confirmLabel="Cancel receipt"
        destructive
        pending={pending}
        onConfirm={(reason) =>
          run(() => cancelGoodsReceipt(grnId, reason), {
            pending: "Cancelling receipt…",
            optimistic: () => live.set("CANCELLED"),
            success: "Receipt cancelled",
            onSuccess: () => setOpen(false),
          })
        }
      />
    </>
  );
}

/** FMS ST7 (return rejected material) and ST8 (stored & entered in Tally). */
export function GrnStepButtons({
  grnId,
  canReturn,
  canStore,
  open,
  returnTo,
}: {
  grnId: number;
  canReturn: boolean;
  canStore: boolean;
  /** Opened from the FMS sheet: start with this dialog open. */
  open?: "return" | "store" | null;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"return" | "store" | null>(() =>
    open === "return" && canReturn ? "return" : open === "store" && canStore ? "store" : null,
  );
  const done = () => {
    setDialog(null);
    if (returnTo) router.push(returnTo);
  };
  const [pending, run] = useServerAction();
  return (
    <>
      {canReturn && (
        <Button variant="outline" onClick={() => setDialog("return")}>
          <Undo2Icon />
          Record return
        </Button>
      )}
      {canStore && (
        <Button variant="outline" onClick={() => setDialog("store")}>
          <ArchiveIcon />
          Stored / Tally
        </Button>
      )}
      <ReasonDialog
        open={dialog === "return"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rejected material returned"
        description="Record how the rejected quantity went back to the vendor (return checklist done)."
        label="Return challan / gate pass no., transporter"
        placeholder="e.g. RGP-118 dated 06 Oct, sent back with VRL LR 55821"
        confirmLabel="Save return"
        pending={pending}
        onConfirm={(note) => run(() => recordReturn(grnId, note), { pending: "Saving return…", success: "Return recorded", onSuccess: done })}
      />
      <ReasonDialog
        open={dialog === "store"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Material stored"
        description="Confirm the accepted material is put away and the receipt is entered in Tally."
        label="Tally voucher / GRN no. (optional)"
        placeholder="e.g. Tally receipt note 2026/RN/0412"
        confirmLabel="Mark stored"
        minLength={0}
        pending={pending}
        onConfirm={(ref) => run(() => markStored(grnId, ref), { pending: "Saving…", success: "Marked as stored", onSuccess: done })}
      />
    </>
  );
}