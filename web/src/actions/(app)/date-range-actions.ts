// Web app version of src/app/(app)/date-range-actions.ts: the range lives in this browser.
import { ALL_DATES, resolveRange } from "@/lib/date-range";
import { setRangeValue } from "../../date-range";

export async function setDateRange(value: string) {
  if (value !== ALL_DATES && !resolveRange(value)) return { ok: false as const, error: "Pick a valid date range." };
  setRangeValue(value);
  return { ok: true as const, data: undefined };
}
