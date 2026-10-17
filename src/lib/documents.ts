import "server-only";

import type { DocumentType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ActionError } from "@/lib/action-error";
import { saveFile } from "@/lib/storage";

/** Files people can attach to a goods receipt or bill (invoice, bilty, test certificate…). */
export const DOCUMENT_FILE_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_FILE = 5 * 1024 * 1024;

export function checkDocumentFile(file: File) {
  if (!DOCUMENT_FILE_TYPES[file.type]) throw new ActionError(`“${file.name}”: attach a PDF, PNG, JPG or WebP file.`);
  if (file.size > MAX_FILE) throw new ActionError(`“${file.name}” is larger than 5 MB.`);
}

/** Stores a file and records it against the goods receipt (and its PO). */
export async function storeGrnDocument(grn: { id: number; poId: number }, type: DocumentType, file: File, userId: number) {
  const ext = DOCUMENT_FILE_TYPES[file.type];
  const stored = await saveFile(`grn/${grn.id}/${type.toLowerCase()}-${Date.now()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
  return db.document.create({
    data: {
      type,
      grnId: grn.id,
      poId: grn.poId,
      fileName: file.name.slice(0, 200),
      storagePath: stored.storagePath,
      mimeType: file.type,
      size: stored.size,
      sha256: stored.sha256,
      createdById: userId,
    },
    select: { id: true },
  });
}
