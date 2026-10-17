import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadNewIndentForm } from "@/lib/screens/forms";
import { NewIndentView } from "@/components/screens/new-indent";

export const metadata: Metadata = { title: "New indent" };

export default async function NewIndentPage(props: PageProps<"/indents/new">) {
  const user = await requirePermission("raiseIndent");
  const { items, lines } = await loadNewIndentForm((await props.searchParams).items);
  return <NewIndentView items={items} lines={lines} user={user} />;
}
