/**
 * Reading an invoice with AI (Gemini), for the invoices the browser's rules can't read well (poor
 * photos, unusual layouts). The file goes to Google's Gemini API with the key kept here on the
 * server (GEMINI_API_KEY); the answer is structured JSON, which the browser checks the same way as
 * its own reading (quantity × rate = amount, totals add up) before anything fills a form.
 */
import { Hono } from "hono";
import { can } from "@/lib/roles";
import type { ApiEnv } from "../auth";

export const ai = new Hono<ApiEnv>();

/** In order: pinned for steady results, then an older Flash, then the "latest Flash" alias (overloads and retirements move around). */
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const PROMPT = `You read Indian GST tax invoices (often Tally / e-invoice printouts, scans or phone photos) for a purchase department.
Extract exactly what is printed. Do not guess: use null for anything not readable.
Numbers: plain numbers without commas or currency (8,00,000.00 -> 800000). Dates: YYYY-MM-DD (13-Oct-26 -> 2026-10-13; day comes first).
lines: only goods/services rows of the item table, in order (not freight, taxes, round-off or totals). unit as printed (KGS, NOS, BAG …).
charges: freight, packing, forwarding, insurance and similar rows, with the GST % if printed on that row.
taxes: IGST / CGST / SGST / UTGST amounts as printed (sum of all rates for each kind).
grandTotal: the invoice total payable (incl. GST). orderNo: the buyer's order / PO number printed on the invoice.
gstins: every GSTIN printed (seller and buyer).`;

const num = { type: "NUMBER", nullable: true };
const str = { type: "STRING", nullable: true };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    invoiceNo: str,
    invoiceDate: str,
    orderNo: str,
    ewayBill: str,
    vehicleNo: str,
    challanNo: str,
    lrNo: str,
    sellerName: str,
    gstins: { type: "ARRAY", items: { type: "STRING" } },
    lines: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { description: str, hsn: str, qty: num, unit: str, rate: num, amount: num } },
    },
    charges: { type: "ARRAY", items: { type: "OBJECT", properties: { description: str, amount: num, percent: num } } },
    taxes: { type: "ARRAY", items: { type: "OBJECT", properties: { label: str, amount: num } } },
    roundOff: num,
    grandTotal: num,
  },
};

ai.post("/invoice", async (c) => {
  const user = c.get("user");
  if (!can(user.roles, "receiveGoods") && !can(user.roles, "enterBill")) return c.json({ error: "You don't have permission to do that." }, 403);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return c.json({ error: "AI reading isn't set up (no Gemini key on the server)." }, 503);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return c.json({ error: "Choose the invoice file." }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "The file is larger than 8 MB." }, 400);
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
  if (!TYPES.includes(type)) return c.json({ error: "AI reads PDFs and photos (JPG, PNG, WebP)." }, 400);

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const started = Date.now();
  type Reply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; error?: { message?: string } } | null;
  let res: Response | null = null;
  let body: Reply = null;
  let model = MODELS[0];
  // Down the list: a retired model (404), a busy one (503 / 429) or one taking over 45 s → the next.
  const busy = (r: Response | null) => !r || r.status === 503 || r.status === 429 || r.status === 404;
  for (const m of MODELS) {
    model = m;
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: type, data } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    body = res ? ((await res.json().catch(() => null)) as Reply) : null;
    if (!busy(res)) break;
  }
  if (!res) return c.json({ error: "Couldn't reach Gemini. Try again in a moment." }, 502);
  if (!res.ok || !body) {
    console.error("Gemini error", model, res.status, body?.error?.message);
    return c.json({ error: busy(res) ? "Gemini is busy right now; try again in a minute." : "Gemini couldn't read this file." }, 502);
  }
  // The answer (thinking parts left out).
  const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  try {
    return c.json({ model, ms: Date.now() - started, invoice: JSON.parse(text) });
  } catch {
    return c.json({ error: "Gemini's answer wasn't readable. Try again." }, 502);
  }
});
