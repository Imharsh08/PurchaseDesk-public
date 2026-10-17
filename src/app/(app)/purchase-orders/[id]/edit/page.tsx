import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { loadEditPurchaseOrderForm } from "@/lib/screens/forms";
import { EditPurchaseOrderView } from "@/components/screens/edit-purchase-order";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage(props: PageProps<"/purchase-orders/[id]/edit">) {
  const user = await requirePermission("createPO");
  const { id } = await props.params;
  const poId = Number(id);
  if (!Number.isInteger(poId)) notFound();
  const { po, options } = await loadEditPurchaseOrderForm(poId);
  return <EditPurchaseOrderView options={options} po={po} user={user} />;
}
