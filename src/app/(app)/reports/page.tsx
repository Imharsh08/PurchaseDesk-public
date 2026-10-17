import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { getDateRange } from "@/lib/date-range-server";
import { loadReport } from "@/lib/screens/reports";
import { ReportsView } from "@/components/screens/reports";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  await requirePermission("viewReports");
  const [sp, dateRange] = await Promise.all([props.searchParams, getDateRange()]);
  const { key, by, data } = await loadReport({ r: typeof sp.r === "string" ? sp.r : undefined, by: typeof sp.by === "string" ? sp.by : undefined, range: dateRange });
  // "key" is reserved by React, so the report key travels as reportKey.
  return <ReportsView by={by} data={data} dateRange={dateRange} reportKey={key} />;
}
