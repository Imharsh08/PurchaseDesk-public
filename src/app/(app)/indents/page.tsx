import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { getDateRange } from "@/lib/date-range-server";
import { loadIndentList } from "@/lib/screens/indents";
import { listLimit } from "@/lib/list-limit";
import { IndentsView } from "@/components/screens/indents";

export const metadata: Metadata = { title: "Indents" };

export default async function IndentsPage(props: PageProps<"/indents">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const limit = listLimit(sp);
  const range = await getDateRange();
  const { tab: tabKey, indents, tabCounts } = await loadIndentList({ q: query, tab: typeof sp.status === "string" ? sp.status : undefined, limit, range });
  return <IndentsView indents={indents} limit={limit} query={query} range={range} sp={sp} tabCounts={tabCounts} tabKey={tabKey} user={user} />;
}
