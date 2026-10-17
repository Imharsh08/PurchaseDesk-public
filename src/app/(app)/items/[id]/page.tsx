import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadItemScreen } from "@/lib/screens/item";
import { getDateRange } from "@/lib/date-range-server";
import { ItemView } from "@/components/screens/item";

export async function generateMetadata(props: PageProps<"/items/[id]">): Promise<Metadata> {
  const id = Number((await props.params).id) || 0;
  const item = await db.item.findUnique({ where: { id }, select: { name: true } });
  return { title: item?.name ?? "Item" };
}

export default async function ItemPage(props: PageProps<"/items/[id]">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const range = await getDateRange();

  const data = await loadItemScreen(id, range);
  if (!data) notFound();
  const { item, links, history, stockLog, onOrder, perf, packItem, current, position, status, lastPO, activeRates, lowest, pendingLines, unitItem, bought } = data;
  return <ItemView activeRates={activeRates} bought={bought} current={current} history={history} id={id} item={item} lastPO={lastPO} links={links} lowest={lowest} onOrder={onOrder} packItem={packItem} pendingLines={pendingLines} perf={perf} position={position} range={range} status={status} stockLog={stockLog} unitItem={unitItem} user={user} />;
}
