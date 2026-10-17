/**
 * Files for the web app — documents, quotation files, PO PDFs, letterhead logos — at the same
 * addresses as the Next app (/api/...), by running its route handlers unchanged. They check the
 * signed-in user themselves (getCurrentUser, from the API request here); the web app fetches them
 * with its session token (web/src/files.ts) since a plain link can't carry one.
 */
import { Hono } from "hono";
import { GET as logo } from "@/app/api/branding/logo/route";
import { GET as document } from "@/app/api/documents/[id]/route";
import { GET as poPdf } from "@/app/api/purchase-orders/[id]/pdf/route";
import { GET as quotationFile } from "@/app/api/quotations/[id]/file/route";
import type { ApiEnv } from "../auth";

export const files = new Hono<ApiEnv>();

// Next passes route params as a promise; the handlers only read `id`.
const params = (id: string) => ({ params: Promise.resolve({ id }) });

files.get("/documents/:id", (c) => document(c.req.raw, params(c.req.param("id"))));
files.get("/quotations/:id/file", (c) => quotationFile(c.req.raw, params(c.req.param("id"))));
files.get("/purchase-orders/:id/pdf", (c) => poPdf(c.req.raw, params(c.req.param("id"))));
files.get("/branding/logo", (c) => logo(c.req.raw));
