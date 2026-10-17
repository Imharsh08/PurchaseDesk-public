/**
 * Asks the server to read an invoice with AI (Gemini; api/routes/ai.ts). Only the web app has that
 * server: it replaces this module (web/src/shims/ai-invoice.ts) with the real call.
 */
import type { AiInvoice } from "@/lib/invoice-reader/ai";

export async function readInvoiceWithAi(file: Blob & { name?: string }): Promise<{ invoice: AiInvoice; model: string }> {
  void file;
  throw new Error("Reading with AI is available in the web app (web/, on Cloudflare Pages).");
}
