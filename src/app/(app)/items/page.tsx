import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { loadItemList } from "@/lib/screens/masters";
import { can } from "@/lib/roles";
import { ItemsView } from "@/components/screens/items";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage(props: PageProps<"/items">) {
  const user = await requireUser();
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const canEdit = can(user.roles, "manageMasters");

  const { items, categories } = await loadItemList(query);
  return <ItemsView canEdit={canEdit} categories={categories} items={items} query={query} />;
}
