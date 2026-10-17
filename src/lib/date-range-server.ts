import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { DATE_RANGE_COOKIE, DEFAULT_RANGE, resolveRange } from "@/lib/date-range";

export { within } from "@/lib/date-range";

/** The chosen range's cookie value ("this-month", "all", …); this FY when nothing was chosen. */
export const getDateRangeValue = cache(async () => (await cookies()).get(DATE_RANGE_COOKIE)?.value ?? DEFAULT_RANGE);

/** The date range chosen in the top bar, or null for all dates. Memoised per request. */
export const getDateRange = cache(async () => resolveRange(await getDateRangeValue()));
