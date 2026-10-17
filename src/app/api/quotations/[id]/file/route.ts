import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { openStoredFile } from "@/lib/storage";

const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };

/** Serves a vendor's attached quotation document to signed-in users. */
export async function GET(_request: Request, ctx: RouteContext<"/api/quotations/[id]/file">) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  const q = Number.isInteger(id)
    ? await db.quotation.findUnique({ where: { id }, select: { attachmentPath: true, attachmentName: true } })
    : null;
  const file = await openStoredFile(q?.attachmentPath);
  if (!file || !q?.attachmentPath) return new Response(null, { status: 404 });
  const ext = q.attachmentPath.split(".").pop()?.toLowerCase() ?? "";
  const name = (q.attachmentName ?? `quotation.${ext}`).replace(/["\\\r\n]/g, "_");
  return new Response(file.body, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      ...(file.size ? { "Content-Length": file.size } : {}),
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
