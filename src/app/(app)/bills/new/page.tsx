import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadBillForm } from "@/lib/screens/forms";
import { BillFormView } from "@/components/screens/bill-form";

export const metadata: Metadata = { title: "Enter bill" };

export default async function NewBillPage(props: PageProps<"/bills/new">) {
  await requirePermission("enterBill");
  const sp = await props.searchParams;
  const { ctx, grn, existing, invoiceFiles, initial } = await loadBillForm(sp.grn);
  return <BillFormView ctx={ctx} existing={existing} grn={grn} initial={initial} invoiceFiles={invoiceFiles} sp={sp} />;
}
