import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadStockUpdateForm } from "@/lib/screens/forms";
import { StockUpdateView } from "@/components/screens/stock-update";

export const metadata: Metadata = { title: "Update stock" };

export default async function UpdateStockPage() {
  await requirePermission("updateStock");
  const { items } = await loadStockUpdateForm();
  return <StockUpdateView items={items} />;
}
