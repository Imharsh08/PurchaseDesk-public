import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { loadAmendForm } from "@/lib/screens/forms";
import { AmendPurchaseOrderView } from "@/components/screens/amend-purchase-order";

export const metadata: Metadata = { title: "Amend purchase order" };

export default async function AmendPOPage(props: PageProps<"/purchase-orders/[id]/amend">) {
  const user = await requirePermission("amendPO");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const { po, addresses, fallback } = await loadAmendForm(id);
  return <AmendPurchaseOrderView addresses={addresses} fallback={fallback} id={id} po={po} user={user} />;
}
