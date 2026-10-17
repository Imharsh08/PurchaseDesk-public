import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { getDateRange } from "@/lib/date-range-server";
import { loadQuotationBoard } from "@/lib/screens/indents";
import { QuotationsView } from "@/components/screens/quotations";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage() {
  await requireUser();
  const range = await getDateRange();
  const { indents } = await loadQuotationBoard(range);
  return <QuotationsView indents={indents} range={range} />;
}
