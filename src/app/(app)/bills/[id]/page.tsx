import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadBillScreen } from "@/lib/screens/bill";
import { BillView } from "@/components/screens/bill";

export async function generateMetadata(props: PageProps<"/bills/[id]">): Promise<Metadata> {
  const id = Number((await props.params).id) || 0;
  const b = await db.bill.findUnique({ where: { id }, select: { billNumber: true } });
  return { title: b?.billNumber ?? "Bill" };
}

export default async function BillPage(props: PageProps<"/bills/[id]">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();

  const data = await loadBillScreen(id, user);
  if (!data) notFound();
  const { bill, invoiceFiles, outstanding, overdueDays, debit, timeline } = data;
  return <BillView bill={bill} debit={debit} invoiceFiles={invoiceFiles} outstanding={outstanding} overdueDays={overdueDays} timeline={timeline} user={user} />;
}
