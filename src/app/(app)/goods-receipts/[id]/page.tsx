import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadGoodsReceiptScreen } from "@/lib/screens/goods-receipt";
import { fmsReturnTo } from "@/lib/fms-steps";
import { GoodsReceiptView } from "@/components/screens/goods-receipt";

export async function generateMetadata(props: PageProps<"/goods-receipts/[id]">): Promise<Metadata> {
  const id = Number((await props.params).id) || 0;
  const grn = await db.goodsReceipt.findUnique({ where: { id }, select: { grnNumber: true } });
  return { title: grn?.grnNumber ?? "Goods receipt" };
}

export default async function GoodsReceiptPage(props: PageProps<"/goods-receipts/[id]">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const sp = await props.searchParams;
  const returnTo = fmsReturnTo(sp.from);
  const openStep = sp.do === "return" || sp.do === "store" ? sp.do : null;

  const data = await loadGoodsReceiptScreen(id, user);
  if (!data) notFound();
  const { grn, issues, activity, daysLate, canQc, canReceive, itemOptions, rejected, done, timeline } = data;
  return <GoodsReceiptView activity={activity} canQc={canQc} canReceive={canReceive} daysLate={daysLate} done={done} grn={grn} issues={issues} itemOptions={itemOptions} openStep={openStep} rejected={rejected} returnTo={returnTo} timeline={timeline} user={user} />;
}
