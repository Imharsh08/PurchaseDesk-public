import { BackLink } from "@/components/back-link";
import { AlertCircleIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isAdmin } from "@/lib/roles";
import { toDateInput } from "@/lib/format";
import { poDisplayNumber } from "@/lib/po-status";
import { POForm } from "@/app/(app)/purchase-orders/po-form";
import type { ScreenUser } from "@/components/screens/types";
import type { loadEditPurchaseOrderForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadEditPurchaseOrderForm>>>;
export type EditPurchaseOrderViewProps = Pick<Data, "options" | "po"> & {
  user: ScreenUser;
};

export function EditPurchaseOrderView({ options, po, user }: EditPurchaseOrderViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/purchase-orders/${po.id}`}>{poDisplayNumber(po)}</BackLink>
        }
        title={`Edit ${poDisplayNumber(po)}`}
        description="Changes are saved to the draft. Submit again when it's ready for approval."
      />
      {po.rejectionReason && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Sent back by approver</AlertTitle>
          <AlertDescription>{po.rejectionReason}</AlertDescription>
        </Alert>
      )}
      <POForm
        poId={po.id}
        locked={po.quotationId !== null}
        vendors={options.vendors}
        items={options.items}
        company={options.company}
        addresses={options.addresses}
        transport={options.transport}
        canSetDefaultAddress={isAdmin(user.roles)}
        initial={{
          vendorId: po.vendorId,
          expectedDeliveryDate: toDateInput(po.expectedDeliveryDate),
          quotationRef: po.quotationRef ?? "",
          quotationDate: toDateInput(po.quotationDate),
          billingAddress: po.billingAddress ?? options.defaultAddresses.billing,
          deliveryAddress: po.deliveryAddress ?? options.defaultAddresses.shipping,
          paymentTerms: po.paymentTerms ?? "",
          terms: po.terms ?? "",
          internalNotes: po.internalNotes ?? "",
          items: po.items.map((i) => ({
            itemId: i.itemId,
            description: i.description,
            quantity: i.quantity.toString(),
            rate: i.rate.toString(),
            discountPct: Number(i.discountPct) ? i.discountPct.toString() : "",
            gstRate: String(Number(i.gstRate)),
            remarks: i.remarks ?? "",
            uom: i.uom,
          })),
        }}
      />
    </div>
  );
}
