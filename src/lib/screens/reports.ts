import "server-only";

import { REPORTS, type ReportKey } from "@/lib/screens/options";

import type { DateRange } from "@/lib/date-range";
import {
  SPEND_GROUPS,
  grnRegister,
  payablesAgeing,
  pendingLines,
  poRegister,
  priceVariance,
  savingsReport,
  spendReport,
  vendorScorecard,
  type ReportData,
  type SpendGroup,
} from "@/lib/reports";

/** "All dates": wide enough for every record. */
const ALL_TIME = { from: new Date("2000-01-01T00:00:00+05:30"), to: new Date("2100-01-01T00:00:00+05:30") };

/** One report for the top-bar date range (?r= which report, ?by= grouping for spend). */
export async function loadReport({ r, by: byKey, range: dateRange }: { r: string | undefined; by: string | undefined; range: DateRange | null }) {
  const key: ReportKey = REPORTS.find((x) => x.key === r)?.key ?? "spend";
  const by: SpendGroup = byKey && byKey in SPEND_GROUPS ? (byKey as SpendGroup) : "vendor";
  const range = dateRange ? { from: dateRange.start, to: dateRange.end } : ALL_TIME;
  const data: ReportData =
    key === "spend"
      ? await spendReport(range, by)
      : key === "savings"
        ? await savingsReport(range)
        : key === "price"
          ? await priceVariance(range)
          : key === "vendors"
            ? await vendorScorecard(range)
            : key === "po"
              ? await poRegister(range)
              : key === "pending"
                ? await pendingLines()
                : key === "grn"
                  ? await grnRegister(range)
                  : await payablesAgeing();
  return { key, by, data };
}

export { REPORTS, type ReportKey } from "@/lib/screens/options";
