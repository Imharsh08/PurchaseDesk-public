import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/roles";
import { loadVendorList } from "@/lib/screens/masters";
import { VendorsView } from "@/components/screens/vendors";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage(props: PageProps<"/vendors">) {
  const user = await requireUser();
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const canEdit = can(user.roles, "manageMasters");

  const { vendors, performance: perf, transport } = await loadVendorList(query);
  return <VendorsView canEdit={canEdit} perf={perf} query={query} transport={transport} vendors={vendors} />;
}
