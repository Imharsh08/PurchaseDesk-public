import { BackLink } from "@/components/back-link";
import { InfoIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate, toDateInput } from "@/lib/format";
import { fmsReturnTo } from "@/lib/fms-steps";
import { GrnForm } from "@/app/(app)/goods-receipts/new/grn-form";
import type { SearchParams } from "@/components/screens/types";
import type { loadReceiveForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadReceiveForm>>>;
export type ReceiveGoodsViewProps = Pick<Data, "late" | "lines" | "po" | "receivable"> & {
  sp: SearchParams;
};

export function ReceiveGoodsView({ late, lines, po, receivable, sp }: ReceiveGoodsViewProps) {
  const today = new Date();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/purchase-orders/${po.id}`}>{po.poNumber}</BackLink>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            Receive material
            <POStatusBadge status={po.status} className="text-xs" />
          </span>
        }
        description={
          <>
            {po.vendor.name} · {po.poNumber}
            {po.expectedDeliveryDate && (
              <span className={late ? "text-destructive" : undefined}> · Delivery due {formatDate(po.expectedDeliveryDate)}</span>
            )}
          </>
        }
      />
      {!receivable ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Material can be received only against an issued, open PO. This PO is {po.status.toLowerCase().replace("_", " ")}.
          </AlertDescription>
        </Alert>
      ) : (
        <GrnForm
          returnTo={fmsReturnTo(sp.from)}
          poId={po.id}
          today={toDateInput(today)}
          dispatch={{ transporter: po.dispatchTransporter ?? "", biltyNo: po.dispatchBiltyNo ?? "", biltyDate: toDateInput(po.dispatchedAt) }}
          lines={lines.map((l) => ({
            poItemId: l.poItemId,
            lineNo: l.lineNo,
            sku: l.sku,
            description: l.description,
            uom: l.uom,
            packUnit: l.packUnit,
            packSize: l.packSize,
            ordered: l.ordered,
            accepted: l.accepted,
            awaitingCheck: l.awaitingCheck,
            pending: l.pending,
            rate: l.rate,
            unitItem: l.unitItem,
          }))}
          vendorGstin={po.vendor.gstin}
          poNumber={po.poNumber}
        />
      )}
    </div>
  );
}
