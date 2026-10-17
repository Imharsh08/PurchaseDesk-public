import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { loadNewQuotationForm } from "@/lib/screens/forms";
import { NewQuotationView } from "@/components/screens/new-quotation";

export const metadata: Metadata = { title: "Add quotation" };

export default async function NewQuotationPage(props: PageProps<"/indents/[id]/quotations/new">) {
  await requirePermission("manageQuotations");
  const indentId = Number((await props.params).id);
  if (!Number.isInteger(indentId)) notFound();
  const { indent, vendors, lines } = await loadNewQuotationForm(indentId);
  return <NewQuotationView indent={indent} indentId={indentId} lines={lines} vendors={vendors} />;
}
