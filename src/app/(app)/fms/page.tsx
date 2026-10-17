import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { loadFmsScreen } from "@/lib/screens/fms";
import { getDateRange } from "@/lib/date-range-server";
import { PERIODS as SCORE_PERIODS, type PeriodKey } from "@/lib/fms-score";
import { FmsView } from "@/components/screens/fms";

export const metadata: Metadata = { title: "FMS tracker" };

export default async function FmsPage(props: PageProps<"/fms">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const period: PeriodKey = SCORE_PERIODS.find((p) => p.key === sp.period)?.key ?? "this-week";
  const range = await getDateRange();
  const { view, days, rows, tat, assigned, canDo, mine } = await loadFmsScreen({
    view: typeof sp.view === "string" ? sp.view : undefined,
    days: typeof sp.days === "string" ? sp.days : undefined,
    range,
    user,
  });
  return <FmsView assigned={assigned} canDo={canDo} days={days} mine={mine} period={period} range={range} rows={rows} sp={sp} tat={tat} user={user} view={view} />;
}
