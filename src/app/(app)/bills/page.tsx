import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { listLimit } from "@/lib/list-limit";
import { getDateRange } from "@/lib/date-range-server";
import { loadBillsScreen } from "@/lib/screens/bills";
import { BillsView } from "@/components/screens/bills";

export const metadata: Metadata = { title: "Bills & payments" };

export default async function BillsPage(props: PageProps<"/bills">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const limit = listLimit(sp);
  const range = await getDateRange();
  const { view, unpaid, toPass, noBill, paid, paidCount, counts, summary } = await loadBillsScreen({
    view: typeof sp.view === "string" ? sp.view : undefined,
    limit,
    range,
  });
  return <BillsView counts={counts} limit={limit} noBill={noBill} paid={paid} paidCount={paidCount} range={range} sp={sp} summary={summary} toPass={toPass} unpaid={unpaid} user={user} view={view} />;
}
