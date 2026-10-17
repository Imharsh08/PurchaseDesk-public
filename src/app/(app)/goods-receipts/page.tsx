import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { listLimit } from "@/lib/list-limit";
import { getDateRange } from "@/lib/date-range-server";
import { loadGoodsReceiptsScreen } from "@/lib/screens/goods-receipts";
import { can } from "@/lib/roles";
import { GoodsReceiptsView } from "@/components/screens/goods-receipts";

export const metadata: Metadata = { title: "Goods receipt" };

export default async function GoodsReceiptsPage(props: PageProps<"/goods-receipts">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const canReceive = can(user.roles, "receiveGoods");
  const limit = listLimit(sp);
  const range = await getDateRange();
  const { view, awaiting, overdue, receipts: grns, receiptTotal, pendingCount, openIssues, issues } = await loadGoodsReceiptsScreen({
    view: typeof sp.view === "string" ? sp.view : undefined,
    limit,
    range,
  });
  return <GoodsReceiptsView awaiting={awaiting} canReceive={canReceive} grns={grns} issues={issues} limit={limit} openIssues={openIssues} overdue={overdue} pendingCount={pendingCount} range={range} receiptTotal={receiptTotal} sp={sp} user={user} view={view} />;
}
