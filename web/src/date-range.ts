/**
 * The app-wide date range in the web app: kept in this browser instead of a cookie, with the same
 * rules as the Next app (src/lib/date-range): This FY by default, a choice lasts a working day.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_RANGE, resolveRange } from "@/lib/date-range";
import { refreshData } from "./data";

const KEY = "pd_range";
const LASTS_MS = 12 * 60 * 60 * 1000;

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { value: string; at: number } | null;
    if (saved && Date.now() - saved.at < LASTS_MS && (saved.value === "all" || resolveRange(saved.value))) return saved.value;
  } catch {}
  return DEFAULT_RANGE;
}

let current = read();
const listeners = new Set<() => void>();

export function getRangeValue() {
  return current;
}

export function setRangeValue(value: string) {
  current = value;
  try {
    localStorage.setItem(KEY, JSON.stringify({ value, at: Date.now() }));
  } catch {}
  listeners.forEach((fn) => fn());
  refreshData();
}

export function useRangeValue() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => DEFAULT_RANGE,
  );
}

/** The path with the current range added (?range=…), for dated screens. */
export function withRange(path: string, value = current) {
  return `${path}${path.includes("?") ? "&" : "?"}range=${encodeURIComponent(value)}`;
}
