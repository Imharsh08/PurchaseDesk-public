import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { loadDebitNoteScreen } from "@/lib/screens/debit-note";
import { DebitNoteView } from "@/components/screens/debit-note";

export const metadata: Metadata = { title: "Debit note" };

export default async function DebitNotePage(props: PageProps<"/debit-note/[id]">) {
  await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();

  const data = await loadDebitNoteScreen(id);
  if (!data) notFound();
  const { bill, company, rows, other, total } = data;
  return <DebitNoteView bill={bill} company={company} other={other} rows={rows} total={total} />;
}
