import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { loadEditIndentForm } from "@/lib/screens/forms";
import { EditIndentView } from "@/components/screens/edit-indent";

export const metadata: Metadata = { title: "Edit indent" };

export default async function EditIndentPage(props: PageProps<"/indents/[id]/edit">) {
  await requirePermission("raiseIndent");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const { indent, items } = await loadEditIndentForm(id);
  return <EditIndentView id={id} indent={indent} items={items} />;
}
