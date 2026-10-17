import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { loadEditQuotationForm } from "@/lib/screens/forms";
import { EditQuotationView } from "@/components/screens/edit-quotation";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage(props: PageProps<"/indents/[id]/quotations/[qid]/edit">) {
  await requirePermission("manageQuotations");
  const { id, qid } = await props.params;
  const indentId = Number(id);
  const quotationId = Number(qid);
  if (!Number.isInteger(indentId) || !Number.isInteger(quotationId)) notFound();
  const { added } = await props.searchParams;
  const { quote, indent, vendors, lines } = await loadEditQuotationForm(indentId, quotationId);
  return <EditQuotationView added={added} indent={indent} indentId={indentId} lines={lines} quotationId={quotationId} quote={quote} vendors={vendors} />;
}
