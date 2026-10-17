import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { loadNewPurchaseOrderScreen } from "@/lib/screens/forms";
import { NewPurchaseOrderView } from "@/components/screens/new-purchase-order";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  const user = await requireUser();
  const { ready } = await loadNewPurchaseOrderScreen();
  return <NewPurchaseOrderView ready={ready} user={user} />;
}
