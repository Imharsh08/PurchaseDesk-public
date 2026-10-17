import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { StoreIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuotationForm } from "@/app/(app)/indents/[id]/quotations/quotation-form";
import type { loadNewQuotationForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadNewQuotationForm>>>;
export type NewQuotationViewProps = Pick<Data, "indent" | "lines" | "vendors"> & {
  indentId: number;
};

export function NewQuotationView({ indent, indentId, lines, vendors }: NewQuotationViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/indents/${indentId}`}>{indent.indentNumber}</BackLink>
        }
        title="Add quotation"
        description={`Quotation ${indent.quotations.length + 1} for ${indent.indentNumber}. Enter one vendor's quote.`}
      />
      {vendors.length === 0 ? (
        <Card>
          <EmptyState
            icon={StoreIcon}
            title="No more vendors to quote"
            description="Every active vendor already has a quotation on this indent. Add a vendor to collect another."
            action={
              <Button asChild>
                <Link href="/vendors">Go to vendors</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <QuotationForm
          indentId={indentId}
          vendors={vendors}
          lines={lines}
          initial={{
            vendorId: null,
            vendorRef: "",
            quoteDate: "",
            validUntil: "",
            deliveryDays: "",
            paymentTerms: "",
            creditDays: "",
            earlyDiscountPct: "",
            freightTerms: "",
            otherCharges: "",
            notes: "",
            lines: {},
            attachmentName: null,
          }}
        />
      )}
    </div>
  );
}
