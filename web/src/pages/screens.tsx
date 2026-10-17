/**
 * Every read screen of the web app: fetch the screen's data from the API (src/lib/screens loaders
 * behind it), then draw it with the same view as the Next app (src/components/screens).
 */
import { ConstructionIcon } from "lucide-react";
import { Navigate } from "react-router";
import { readHome } from "@/components/dashboard-switch";
import { ApprovalsView } from "@/components/screens/approvals";
import { BillView } from "@/components/screens/bill";
import { BillsView } from "@/components/screens/bills";
import { DashboardView } from "@/components/screens/dashboard";
import { DebitNoteView } from "@/components/screens/debit-note";
import { FmsView } from "@/components/screens/fms";
import { GoodsReceiptView } from "@/components/screens/goods-receipt";
import { GoodsReceiptsView } from "@/components/screens/goods-receipts";
import { IndentView } from "@/components/screens/indent";
import { IndentsView } from "@/components/screens/indents";
import { ItemView } from "@/components/screens/item";
import { ItemsView } from "@/components/screens/items";
import { PurchaseOrderView } from "@/components/screens/purchase-order";
import { QuotationsView } from "@/components/screens/quotations";
import { ReportsView } from "@/components/screens/reports";
import { SettingsView } from "@/components/screens/settings";
import { StockView } from "@/components/screens/stock";
import { UsersView } from "@/components/screens/users";
import { VendorView } from "@/components/screens/vendor";
import { VendorsView } from "@/components/screens/vendors";
import { EmptyState } from "@/components/empty-state";
import { resolveRange } from "@/lib/date-range";
import { PERIODS as SCORE_PERIODS, type PeriodKey } from "@/lib/fms-score";
import { fmsReturnTo } from "@/lib/fms-steps";
import { listLimit } from "@/lib/list-limit";
import type { loadSettingsScreen, loadUsersScreen } from "@/lib/screens/admin";
import type { loadApprovals } from "@/lib/screens/approvals";
import type { loadBillScreen } from "@/lib/screens/bill";
import type { loadBillsScreen } from "@/lib/screens/bills";
import type { loadDashboard } from "@/lib/screens/dashboard";
import type { loadDebitNoteScreen } from "@/lib/screens/debit-note";
import type { loadFmsScreen } from "@/lib/screens/fms";
import type { loadGoodsReceiptScreen } from "@/lib/screens/goods-receipt";
import type { loadGoodsReceiptsScreen } from "@/lib/screens/goods-receipts";
import type { loadIndentScreen } from "@/lib/screens/indent";
import type { loadIndentList, loadQuotationBoard } from "@/lib/screens/indents";
import type { loadItemScreen } from "@/lib/screens/item";
import type { loadItemList, loadVendorList } from "@/lib/screens/masters";
import type { loadPurchaseOrderScreen } from "@/lib/screens/purchase-order";
import type { loadReport } from "@/lib/screens/reports";
import type { loadVendorScreen } from "@/lib/screens/vendor";
import type { StockRow } from "@/lib/stock-data";
import { useTitle } from "../app-shell";
import { useRangeValue, withRange } from "../date-range";
import { Screen, useApi, useIdParam, useSearchObject } from "../screen";
import { useCan, useSession } from "../session";
import { queryString } from "./purchase-orders";

type Loaded<F extends (...args: never[]) => unknown> = NonNullable<Awaited<ReturnType<F>>>;

/** The signed-in user (screens are only reachable signed in). */
function useUser() {
  return useSession().me!.user;
}

/** A dated list: the page's own query plus the top-bar range. */
function useListApi<T>(path: string) {
  const sp = useSearchObject();
  const range = useRangeValue();
  return { sp, range, state: useApi<T>(withRange(`${path}${queryString(sp)}`, range)) };
}

export function DashboardPage() {
  // The chosen home is Approvals: open it straight away (no flash of the overview).
  if (readHome() === "approvals") return <Navigate to="/approvals" replace />;
  return <OverviewDashboard />;
}

export function ApprovalsPage() {
  useTitle("Approvals");
  const state = useApi<Loaded<typeof loadApprovals>>("/approvals");
  return <Screen state={state}>{(d) => <ApprovalsView {...d} />}</Screen>;
}

function OverviewDashboard() {
  useTitle("Dashboard");
  const user = useUser();
  const state = useApi<Loaded<typeof loadDashboard>>("/dashboard");
  return <Screen state={state}>{(d) => <DashboardView {...d} today={new Date()} user={user} />}</Screen>;
}

export function FmsPage() {
  useTitle("FMS tracker");
  const user = useUser();
  const { sp, range, state } = useListApi<Loaded<typeof loadFmsScreen>>("/fms");
  const period: PeriodKey = SCORE_PERIODS.find((p) => p.key === sp.period)?.key ?? "this-week";
  return <Screen state={state}>{(d) => <FmsView {...d} period={period} range={resolveRange(range)} sp={sp} user={user} />}</Screen>;
}

export function ReportsPage() {
  useTitle("Reports");
  const { range, state } = useListApi<Loaded<typeof loadReport>>("/reports");
  return <Screen state={state}>{(d) => <ReportsView by={d.by} data={d.data} reportKey={d.key} dateRange={resolveRange(range)} />}</Screen>;
}

export function IndentsPage() {
  useTitle("Indents");
  const user = useUser();
  const { sp, range, state } = useListApi<Loaded<typeof loadIndentList>>("/indents");
  return (
    <Screen state={state}>
      {(d) => (
        <IndentsView indents={d.indents} tabCounts={d.tabCounts} tabKey={d.tab} query={(sp.q ?? "").trim()} limit={listLimit(sp)} range={resolveRange(range)} sp={sp} user={user} />
      )}
    </Screen>
  );
}

export function QuotationsPage() {
  useTitle("Quotations");
  const { range, state } = useListApi<Loaded<typeof loadQuotationBoard>>("/quotations");
  return <Screen state={state}>{(d) => <QuotationsView indents={d.indents} range={resolveRange(range)} />}</Screen>;
}

export function GoodsReceiptsPage() {
  useTitle("Goods receipt");
  const user = useUser();
  const can = useCan();
  const { sp, range, state } = useListApi<Loaded<typeof loadGoodsReceiptsScreen>>("/goods-receipts");
  return (
    <Screen state={state}>
      {(d) => (
        <GoodsReceiptsView
          {...d}
          grns={d.receipts}
          canReceive={can("receiveGoods")}
          limit={listLimit(sp)}
          range={resolveRange(range)}
          sp={sp}
          user={user}
        />
      )}
    </Screen>
  );
}

export function BillsPage() {
  useTitle("Bills & payments");
  const user = useUser();
  const { sp, range, state } = useListApi<Loaded<typeof loadBillsScreen>>("/bills");
  return <Screen state={state}>{(d) => <BillsView {...d} limit={listLimit(sp)} range={resolveRange(range)} sp={sp} user={user} />}</Screen>;
}

export function StockPage() {
  useTitle("Stock");
  const user = useUser();
  const sp = useSearchObject();
  const state = useApi<{ rows: StockRow[] }>("/stock");
  return <Screen state={state}>{(d) => <StockView all={d.rows} sp={sp} user={user} />}</Screen>;
}

export function VendorsPage() {
  useTitle("Vendors");
  const can = useCan();
  const sp = useSearchObject();
  const state = useApi<Loaded<typeof loadVendorList>>(`/vendors${queryString({ q: sp.q })}`);
  return <Screen state={state}>{(d) => <VendorsView vendors={d.vendors} perf={d.performance} transport={d.transport} canEdit={can("manageMasters")} query={(sp.q ?? "").trim()} />}</Screen>;
}

export function ItemsPage() {
  useTitle("Items");
  const can = useCan();
  const sp = useSearchObject();
  const state = useApi<Loaded<typeof loadItemList>>(`/items${queryString({ q: sp.q })}`);
  return <Screen state={state}>{(d) => <ItemsView items={d.items} categories={d.categories} canEdit={can("manageMasters")} query={(sp.q ?? "").trim()} />}</Screen>;
}

// ── Record pages ──

export function PurchaseOrderPage() {
  const id = useIdParam();
  const user = useUser();
  const sp = useSearchObject();
  const state = useApi<Loaded<typeof loadPurchaseOrderScreen>>(`/purchase-orders/${id}`);
  useTitle(state.data?.displayNumber ?? "Purchase order");
  return <Screen state={state}>{(d) => <PurchaseOrderView {...d} sp={sp} user={user} />}</Screen>;
}

export function IndentPage() {
  const id = useIdParam();
  const user = useUser();
  const sp = useSearchObject();
  const state = useApi<Loaded<typeof loadIndentScreen>>(`/indents/${id}`);
  useTitle(state.data?.indent.indentNumber ?? "Indent");
  return <Screen state={state}>{(d) => <IndentView {...d} id={id} returnTo={fmsReturnTo(sp.from)} user={user} />}</Screen>;
}

export function GoodsReceiptPage() {
  const id = useIdParam();
  const user = useUser();
  const sp = useSearchObject();
  const state = useApi<Loaded<typeof loadGoodsReceiptScreen>>(`/goods-receipts/${id}`);
  useTitle(state.data?.grn.grnNumber ?? "Goods receipt");
  const openStep = sp.do === "return" || sp.do === "store" ? sp.do : null;
  return <Screen state={state}>{(d) => <GoodsReceiptView {...d} openStep={openStep} returnTo={fmsReturnTo(sp.from)} user={user} />}</Screen>;
}

export function BillPage() {
  const id = useIdParam();
  const user = useUser();
  const state = useApi<Loaded<typeof loadBillScreen>>(`/bills/${id}`);
  useTitle(state.data?.bill.billNumber ?? "Bill");
  return <Screen state={state}>{(d) => <BillView {...d} user={user} />}</Screen>;
}

export function VendorPage() {
  const id = useIdParam();
  const user = useUser();
  const range = useRangeValue();
  const state = useApi<Loaded<typeof loadVendorScreen>>(withRange(`/vendors/${id}`, range));
  useTitle(state.data?.vendor.name ?? "Vendor");
  return <Screen state={state}>{(d) => <VendorView {...d} id={id} range={resolveRange(range)} user={user} />}</Screen>;
}

export function ItemPage() {
  const id = useIdParam();
  const user = useUser();
  const range = useRangeValue();
  const state = useApi<Loaded<typeof loadItemScreen>>(withRange(`/items/${id}`, range));
  useTitle(state.data?.item.name ?? "Item");
  return <Screen state={state}>{(d) => <ItemView {...d} id={id} range={resolveRange(range)} user={user} />}</Screen>;
}

/** Printable debit note (no app frame, like the Next app). */
export function DebitNotePage() {
  const id = useIdParam();
  const state = useApi<Loaded<typeof loadDebitNoteScreen>>(`/bills/${id}/debit-note`);
  useTitle(state.data ? `Debit note ${state.data.bill.billNumber}` : "Debit note");
  return <Screen state={state}>{(d) => <DebitNoteView {...d} />}</Screen>;
}

// ── Administration ──

export function UsersPage() {
  useTitle("Users");
  const user = useUser();
  const state = useApi<Loaded<typeof loadUsersScreen>>("/users");
  return <Screen state={state}>{(d) => <UsersView {...d} me={user} />}</Screen>;
}

export function SettingsPage() {
  useTitle("Company settings");
  const state = useApi<Loaded<typeof loadSettingsScreen>>("/settings");
  return <Screen state={state}>{(d) => <SettingsView {...d} />}</Screen>;
}

/** Screens that create or change records arrive in phase 4; until then they open in the current app. */
export function NotYetPage({ title }: { title: string }) {
  useTitle(title);
  return (
    <EmptyState
      icon={ConstructionIcon}
      title={`${title} — coming to the new app`}
      description="Creating and changing records is being moved over. Until then, use the current PurchaseDesk for this."
    />
  );
}
