import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { tryReadStoredFile } from "@/lib/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** Serves the uploaded letterhead logos (?slot=logo2 for the second one) to signed-in users. */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const slot = new URL(request.url).searchParams.get("slot") === "logo2" ? "logo2Path" : "logoPath";
  const settings = await db.companySettings.findUnique({ where: { id: 1 }, select: { logoPath: true, logo2Path: true } });
  const key = settings?.[slot];
  const file = await tryReadStoredFile(key);
  if (!file || !key) return new Response(null, { status: 404 });
  return new Response(file.slice(), {
    headers: {
      "Content-Type": TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
}
