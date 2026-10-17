import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadReceiveForm } from "@/lib/screens/forms";
import { ReceiveGoodsView } from "@/components/screens/receive-goods";

export const metadata: Metadata = { title: "Receive material" };

export default async function NewGoodsReceiptPage(props: PageProps<"/goods-receipts/new">) {
  await requirePermission("receiveGoods");
  const sp = await props.searchParams;
  const { po, lines, receivable, late } = await loadReceiveForm(sp.po);
  return <ReceiveGoodsView late={late} lines={lines} po={po} receivable={receivable} sp={sp} />;
}
