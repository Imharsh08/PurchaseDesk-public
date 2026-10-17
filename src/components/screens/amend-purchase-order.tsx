import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { isAdmin } from "@/lib/roles";
import { toDateInput, toNumber } from "@/lib/format";
import type { TaxMode } from "@/lib/po-calc";
import { AmendForm } from "@/app/(app)/purchase-orders/[id]/amend/amend-form";
import type { ScreenUser } from "@/components/screens/types";
import type { loadAmendForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadAmendForm>>>;
export type AmendPurchaseOrderViewProps = Pick<Data, "addresses" | "fallback" | "po"> & {
  id: number;
  user: ScreenUser;
};

export function AmendPurchaseOrderView({ addresses, fallback, id, po, user }: AmendPurchaseOrderViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/purchase-orders/${id}`}>{po.poNumber}</BackLink>
        }
        title={`Amend ${po.poNumber} → Rev. ${po.revision + 1}`}
        description={`${po.vendor.name} · Changes take effect after approval.`}
      />
      <AmendForm
        poId={id}
        taxMode={po.taxMode as TaxMode}
        oldTotal={toNumber(po.grandTotal)}
        header={{
          expectedDeliveryDate: toDateInput(po.expectedDeliveryDate),
          paymentTerms: po.paymentTerms ?? "",
          billingAddress: po.billingAddress ?? fallback.billing,
          deliveryAddress: po.deliveryAddress ?? fallback.shipping,
          terms: po.terms ?? "",
        }}
        addresses={addresses}
        canSetDefaultAddress={isAdmin(user.roles)}
        lines={po.items.map((l) => ({
          poItemId: l.id,
          lineNo: l.lineNo,
          description: l.description,
          sku: l.item.sku,
          uom: l.uom,
          quantity: toNumber(l.quantity),
          rate: toNumber(l.rate),
          discountPct: toNumber(l.discountPct),
          gstRate: toNumber(l.gstRate),
          received: toNumber(l.quantityReceived) + l.grnItems.reduce((s, g) => s + toNumber(g.receivedQty), 0),
        }))}
      />
    </div>
  );
}
