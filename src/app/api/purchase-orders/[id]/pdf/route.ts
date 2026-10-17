import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { generateAndStorePOPdf, getActivePOPdf, poFileName, renderPOPdf } from "@/lib/purchase-orders";
import { readStoredFile } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/api/purchase-orders/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const poId = Number(id);
  const po = Number.isInteger(poId)
    ? await db.purchaseOrder.findUnique({ where: { id: poId }, select: { id: true, poNumber: true } })
    : null;
  if (!po) return Response.json({ error: "Not found" }, { status: 404 });

  let body: Uint8Array;
  let fileName: string;

  try {
    if (po.poNumber) {
      // Issued POs always serve the stored document so every copy is identical.
      const doc = (await getActivePOPdf(po.id)) ?? (await generateAndStorePOPdf(po.id, user.id));
      body = await readStoredFile(doc.storagePath);
      fileName = doc.fileName;
    } else {
      body = (await renderPOPdf(po.id)).pdf;
      fileName = `DRAFT-PO-${po.id}.pdf`;
    }
  } catch (error) {
    console.error("PO PDF failed", error);
    return Response.json({ error: "Could not generate the PDF. Please try again." }, { status: 500 });
  }

  const download = new URL(request.url).searchParams.has("download");
  return new Response(body.slice(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName || poFileName(po.poNumber ?? "draft")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
