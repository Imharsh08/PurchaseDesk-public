import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { getDateRange } from "@/lib/date-range-server";
import { listLimit } from "@/lib/list-limit";
import { loadPurchaseOrderList } from "@/lib/screens/purchase-orders";
import { PurchaseOrdersView } from "@/components/screens/purchase-orders";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage(props: PageProps<"/purchase-orders">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const limit = listLimit(sp);
  const range = await getDateRange();
  const { tab, orders, tabCounts } = await loadPurchaseOrderList({ q: query, tab: typeof sp.status === "string" ? sp.status : undefined, limit, range });
  return <PurchaseOrdersView limit={limit} orders={orders} query={query} range={range} sp={sp} tab={tab} tabCounts={tabCounts} user={user} />;
}
