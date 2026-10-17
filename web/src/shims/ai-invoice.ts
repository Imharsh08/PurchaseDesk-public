/** Stand-in for src/lib/ai-invoice.ts: the invoice goes to the API's /ai/invoice with the session token. */
import type { AiInvoice } from "@/lib/invoice-reader/ai";
import { API_URL, getToken } from "../api";

export async function readInvoiceWithAi(file: Blob & { name?: string }): Promise<{ invoice: AiInvoice; model: string }> {
  const form = new FormData();
  form.set("file", file, file.name ?? "invoice");
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/ai/invoice`, { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { invoice?: AiInvoice; model?: string; error?: string } | null;
  if (!res.ok || !body?.invoice) throw new Error(body?.error ?? `AI reading failed (${res.status}).`);
  return { invoice: body.invoice, model: body.model ?? "Gemini" };
}
