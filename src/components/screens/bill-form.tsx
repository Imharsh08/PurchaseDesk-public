import { BackLink } from "@/components/back-link";
import { InfoIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fmsReturnTo } from "@/lib/fms-steps";
import { toNumber } from "@/lib/format";
import { BillForm } from "@/app/(app)/bills/new/bill-form";
import type { SearchParams } from "@/components/screens/types";
import type { loadBillForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadBillForm>>>;
export type BillFormViewProps = Pick<Data, "ctx" | "existing" | "grn" | "initial" | "invoiceFiles"> & {
  sp: SearchParams;
};

export function BillFormView({ ctx, existing, grn, initial, invoiceFiles, sp }: BillFormViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/goods-receipts/${grn.id}`}>{grn.grnNumber}</BackLink>
        }
        title={existing ? `Edit ${existing.billNumber}` : "Enter vendor bill"}
        description={`${grn.vendor.name} · ${grn.po.poNumber} · ${grn.grnNumber}${ctx.msme ? " · MSME" : ""}`}
      />
      {grn.status !== "COMPLETED" ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>The bill is entered after the quantity & quality check, so it can be matched against the accepted quantity.</AlertDescription>
        </Alert>
      ) : (
        <BillForm
          returnTo={fmsReturnTo(sp.from)}
          grnId={grn.id}
          editing={!!existing}
          creditDays={ctx.creditDays}
          msme={ctx.msme}
          acceptedAt={grn.qcAt?.toISOString() ?? null}
          initial={initial}
          lines={ctx.lines.map((l) => ({ ...l, acceptedQty: toNumber(l.acceptedQty) }))}
          invoiceFiles={invoiceFiles}
          vendorGstin={grn.vendor.gstin}
          poNumber={grn.po.poNumber}
        />
      )}
    </div>
  );
}
