import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadPurchaseOrderScreen } from "@/lib/screens/purchase-order";
import { poDisplayNumber } from "@/lib/po-status";
import { PurchaseOrderView } from "@/components/screens/purchase-order";

export async function generateMetadata(props: PageProps<"/purchase-orders/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const po = await db.purchaseOrder.findUnique({ where: { id: Number(id) || 0 }, select: { id: true, poNumber: true } });
  return { title: po ? poDisplayNumber(po) : "Purchase order" };
}

export default async function PurchaseOrderPage(props: PageProps<"/purchase-orders/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const poId = Number(id);
  if (!Number.isInteger(poId)) notFound();
  const sp = await props.searchParams;

  const data = await loadPurchaseOrderScreen(poId, user);
  if (!data) notFound();
  const { po, company, pdf, activity, receipts, issues, amendments, documents, fallbackAddress, displayNumber, intra, isCreatorOrLead, ownApprovalBlocked, limitNote, showDiscount, pendingAmendment, amendmentLimitNote, canDecideAmendment, showReceived, linked, steps, currentStep, timeline, transport } = data;
  return <PurchaseOrderView activity={activity} amendmentLimitNote={amendmentLimitNote} amendments={amendments} canDecideAmendment={canDecideAmendment} company={company} currentStep={currentStep} displayNumber={displayNumber} documents={documents} fallbackAddress={fallbackAddress} intra={intra} isCreatorOrLead={isCreatorOrLead} issues={issues} limitNote={limitNote} linked={linked} ownApprovalBlocked={ownApprovalBlocked} pdf={pdf} pendingAmendment={pendingAmendment} po={po} receipts={receipts} showDiscount={showDiscount} showReceived={showReceived} sp={sp} steps={steps} timeline={timeline} transport={transport} user={user} />;
}
