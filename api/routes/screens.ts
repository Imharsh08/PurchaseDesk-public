/**
 * Read endpoints: the data behind each screen. Each calls the same screen loader as the Next.js
 * page (src/lib/screens), so the new app shows exactly the same figures. Permissions match the
 * pages: lists are for every signed-in user; restricted screens check their permission.
 */
import { Hono, type Context } from "hono";
import { DEFAULT_RANGE, resolveRange } from "@/lib/date-range";
import { listLimit } from "@/lib/list-limit";
import { loadUsersScreen, loadSettingsScreen } from "@/lib/screens/admin";
import { loadApprovals } from "@/lib/screens/approvals";
import { loadBillScreen } from "@/lib/screens/bill";
import { loadBillsScreen } from "@/lib/screens/bills";
import { loadDashboard } from "@/lib/screens/dashboard";
import { loadDebitNoteScreen } from "@/lib/screens/debit-note";
import { loadFmsScreen } from "@/lib/screens/fms";
import {
  loadAmendForm,
  loadBillForm,
  loadEditIndentForm,
  loadEditPurchaseOrderForm,
  loadEditQuotationForm,
  loadNewIndentForm,
  loadNewPurchaseOrderScreen,
  loadNewQuotationForm,
  loadReceiveForm,
  loadStockUpdateForm,
} from "@/lib/screens/forms";
import { loadGoodsReceiptScreen } from "@/lib/screens/goods-receipt";
import { loadGoodsReceiptsScreen } from "@/lib/screens/goods-receipts";
import { loadIndentScreen } from "@/lib/screens/indent";
import { loadIndentList, loadQuotationBoard } from "@/lib/screens/indents";
import { loadItemScreen } from "@/lib/screens/item";
import { loadItemList, loadVendorList } from "@/lib/screens/masters";
import { loadPurchaseOrderScreen } from "@/lib/screens/purchase-order";
import { loadPurchaseOrderList } from "@/lib/screens/purchase-orders";
import { loadReport } from "@/lib/screens/reports";
import { loadVendorScreen } from "@/lib/screens/vendor";
import { loadStockRows, sidebarCounts } from "@/lib/stock-data";
import { requirePermission, type ApiEnv } from "../auth";

export const screens = new Hono<ApiEnv>();

/** The top-bar date range (?range=this-month, custom:…, all); This FY by default, as in the Next app. */
const rangeOf = (c: Context<ApiEnv>) => resolveRange(c.req.query("range") ?? DEFAULT_RANGE);

/** ?q= search, ?status= tab, ?limit= rows (50 at a time), ?range= date range. */
function listParams(c: Context<ApiEnv>) {
  const query = c.req.query();
  return { q: (query.q ?? "").trim(), tab: query.status, limit: listLimit(query), range: rangeOf(c) };
}

/** Badges in the sidebar (open indents, POs to approve, receipts to check …). */
screens.get("/sidebar-counts", async (c) => c.json(await sidebarCounts()));

screens.get("/purchase-orders", async (c) => c.json(await loadPurchaseOrderList(listParams(c))));
screens.get("/indents", async (c) => c.json(await loadIndentList(listParams(c))));
screens.get("/quotations", async (c) => c.json(await loadQuotationBoard(rangeOf(c))));

screens.get("/goods-receipts", async (c) =>
  c.json(await loadGoodsReceiptsScreen({ view: c.req.query("view"), limit: listLimit(c.req.query()), range: rangeOf(c) })),
);
screens.get("/bills", async (c) => c.json(await loadBillsScreen({ view: c.req.query("view"), limit: listLimit(c.req.query()), range: rangeOf(c) })));

/** Every active item's stock position (the screen filters and sorts in the browser). */
screens.get("/stock", async (c) => c.json({ rows: await loadStockRows() }));
screens.get("/vendors", async (c) => c.json(await loadVendorList((c.req.query("q") ?? "").trim())));
screens.get("/items", async (c) => c.json(await loadItemList((c.req.query("q") ?? "").trim())));

/** Approvals: what waits for a decision, and which of it this user may decide. */
screens.get("/approvals", async (c) => c.json(await loadApprovals(c.get("user"))));

/** Dashboard and FMS tracker: both depend on who is asking ("my tasks", what they can act on). */
screens.get("/dashboard", async (c) => c.json(await loadDashboard(c.get("user"))));
screens.get("/fms", async (c) => c.json(await loadFmsScreen({ view: c.req.query("view"), days: c.req.query("days"), range: rangeOf(c), user: c.get("user") })));

// ── Record pages: 404 when the id is not a whole number or the record doesn't exist. ──
const idOf = (c: Context<ApiEnv>) => {
  const id = Number(c.req.param("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
};
const record = <T,>(c: Context<ApiEnv>, data: T | null) => (data ? c.json(data) : c.json({ error: "Not found." }, 404));

screens.get("/purchase-orders/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadPurchaseOrderScreen(id, c.get("user")) : null);
});
screens.get("/indents/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadIndentScreen(id, c.get("user")) : null);
});
screens.get("/goods-receipts/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadGoodsReceiptScreen(id, c.get("user")) : null);
});
screens.get("/bills/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadBillScreen(id, c.get("user")) : null);
});
screens.get("/bills/:id/debit-note", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadDebitNoteScreen(id) : null);
});
screens.get("/vendors/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadVendorScreen(id, rangeOf(c), c.get("user")) : null);
});
screens.get("/items/:id", async (c) => {
  const id = idOf(c);
  return record(c, id ? await loadItemScreen(id, rangeOf(c)) : null);
});

// ── Forms: what each form starts from. The loaders 404 / redirect as the pages do (e.g. a PO that is
// no longer a draft opens the PO); index.ts turns those into a 404 or { redirect }. ──
const notFoundReply = (c: Context<ApiEnv>) => c.json({ error: "Not found." }, 404);

screens.get("/forms/indents/new", requirePermission("raiseIndent"), async (c) => c.json(await loadNewIndentForm(c.req.query("items"))));
screens.get("/forms/indents/:id/edit", requirePermission("raiseIndent"), async (c) => {
  const id = idOf(c);
  return id ? c.json(await loadEditIndentForm(id)) : notFoundReply(c);
});
screens.get("/forms/indents/:id/quotations/new", requirePermission("manageQuotations"), async (c) => {
  const id = idOf(c);
  return id ? c.json(await loadNewQuotationForm(id)) : notFoundReply(c);
});
screens.get("/forms/indents/:id/quotations/:qid/edit", requirePermission("manageQuotations"), async (c) => {
  const id = idOf(c);
  const qid = Number(c.req.param("qid"));
  return id && Number.isInteger(qid) && qid > 0 ? c.json(await loadEditQuotationForm(id, qid)) : notFoundReply(c);
});
screens.get("/forms/purchase-orders/new", async (c) => c.json(await loadNewPurchaseOrderScreen()));
screens.get("/forms/purchase-orders/:id/edit", requirePermission("createPO"), async (c) => {
  const id = idOf(c);
  return id ? c.json(await loadEditPurchaseOrderForm(id)) : notFoundReply(c);
});
screens.get("/forms/purchase-orders/:id/amend", requirePermission("amendPO"), async (c) => {
  const id = idOf(c);
  return id ? c.json(await loadAmendForm(id)) : notFoundReply(c);
});
screens.get("/forms/goods-receipts/new", requirePermission("receiveGoods"), async (c) => c.json(await loadReceiveForm(c.req.query("po"))));
screens.get("/forms/bills/new", requirePermission("enterBill"), async (c) => c.json(await loadBillForm(c.req.query("grn"))));
screens.get("/forms/stock/update", requirePermission("updateStock"), async (c) => c.json(await loadStockUpdateForm()));

/** Administration. */
screens.get("/users", requirePermission("manageUsers"), async (c) => c.json(await loadUsersScreen()));
screens.get("/settings", requirePermission("manageSettings"), async (c) => c.json(await loadSettingsScreen()));

/** Reports (?r= spend | savings | price | vendors | po | pending | grn | payables, ?by= spend grouping). */
screens.get("/reports", requirePermission("viewReports"), async (c) =>
  c.json(await loadReport({ r: c.req.query("r"), by: c.req.query("by"), range: rangeOf(c) })),
);
