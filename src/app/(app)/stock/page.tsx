import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { loadStockRows } from "@/lib/stock-data";
import { StockView } from "@/components/screens/stock";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage(props: PageProps<"/stock">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const all = await loadStockRows();
  return <StockView all={all} sp={sp} user={user} />;
}
