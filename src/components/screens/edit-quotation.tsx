import { BackLink } from "@/components/back-link";
import { CheckCircle2Icon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toDateInput, toNumber } from "@/lib/format";
import { QuotationForm } from "@/app/(app)/indents/[id]/quotations/quotation-form";
import type { loadEditQuotationForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadEditQuotationForm>>>;
export type EditQuotationViewProps = Pick<Data, "indent" | "lines" | "quote" | "vendors"> & {
  added: string | string[] | undefined;
  indentId: number;
  quotationId: number;
};

export function EditQuotationView({ added, indent, indentId, lines, quotationId, quote, vendors }: EditQuotationViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/indents/${indentId}`}>{indent.indentNumber}</BackLink>
        }
        title={`Quotation from ${quote.vendor.name}`}
      />
      {added && (
        <Alert>
          <CheckCircle2Icon />
          <AlertDescription>
            Quotation saved. Attach the vendor&apos;s document below if you have it, or go back to the indent to add the next quote.
          </AlertDescription>
        </Alert>
      )}
      <QuotationForm
        indentId={indentId}
        quotationId={quotationId}
        vendors={vendors}
        lines={lines}
        initial={{
          vendorId: quote.vendorId,
          vendorRef: quote.vendorRef ?? "",
          quoteDate: toDateInput(quote.quoteDate),
          validUntil: toDateInput(quote.validUntil),
          deliveryDays: quote.deliveryDays?.toString() ?? "",
          paymentTerms: quote.paymentTerms ?? "",
          creditDays: String(quote.creditDays),
          earlyDiscountPct: toNumber(quote.earlyDiscountPct) ? quote.earlyDiscountPct.toString() : "",
          freightTerms: quote.freightTerms ?? "",
          otherCharges: toNumber(quote.otherCharges) ? quote.otherCharges.toString() : "",
          notes: quote.notes ?? "",
          lines: Object.fromEntries(
            quote.items.map((qi) => [
              qi.indentItemId,
              {
                rate: qi.rate.toString(),
                discountPct: toNumber(qi.discountPct) ? qi.discountPct.toString() : "",
                gstRate: String(toNumber(qi.gstRate)),
                remarks: qi.remarks ?? "",
              },
            ]),
          ),
          attachmentName: quote.attachmentName,
        }}
      />
    </div>
  );
}
