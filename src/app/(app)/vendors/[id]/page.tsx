import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadVendorScreen } from "@/lib/screens/vendor";
import { getDateRange } from "@/lib/date-range-server";
import { VendorView } from "@/components/screens/vendor";

export async function generateMetadata(props: PageProps<"/vendors/[id]">): Promise<Metadata> {
  const id = Number((await props.params).id) || 0;
  const v = await db.vendor.findUnique({ where: { id }, select: { name: true } });
  return { title: v?.name ?? "Vendor" };
}

export default async function VendorPage(props: PageProps<"/vendors/[id]">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const range = await getDateRange();

  const data = await loadVendorScreen(id, range, user);
  if (!data) notFound();
  const { vendor, links, history, p, lastPoRate, orders, poAgg, receipts, issues, canEdit, itemOptions, transport } = data;
  return <VendorView canEdit={canEdit} history={history} id={id} issues={issues} itemOptions={itemOptions} lastPoRate={lastPoRate} links={links} orders={orders} p={p} poAgg={poAgg} range={range} receipts={receipts} transport={transport} user={user} vendor={vendor} />;
}
