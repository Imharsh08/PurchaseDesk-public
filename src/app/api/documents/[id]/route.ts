import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { openStoredFile } from "@/lib/storage";

/** Serves an uploaded document (invoice, bilty, test certificate…) to signed-in users. */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  const doc = Number.isInteger(id)
    ? await db.document.findUnique({ where: { id }, select: { storagePath: true, fileName: true, mimeType: true } })
    : null;
  const file = await openStoredFile(doc?.storagePath);
  if (!doc || !file) return new Response(null, { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  const name = doc.fileName.replace(/["\\\r\n]/g, "_");
  return new Response(file.body, {
    headers: {
      "Content-Type": doc.mimeType,
      ...(file.size ? { "Content-Length": file.size } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      // A document's file never changes (a new upload is a new document), so the browser may keep
      // its own copy: opening it again doesn't wake the Worker or refetch it from storage.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
