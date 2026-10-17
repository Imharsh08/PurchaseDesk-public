/**
 * Loading a screen's data from the API. Dates in the JSON come back as Date objects, so shared
 * screens get the same shapes as in the Next app (decimals arrive as strings, which the formatting
 * helpers accept). A "refresh" (after an action, or a new date range) fetches every screen's data again.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const reviveDates = (_key: string, value: unknown) => (typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value);

// ── Refresh signal: a counter every data hook listens to. ──
let generation = 0;
const listeners = new Set<() => void>();
export function refreshData() {
  generation++;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** Run fn on every refresh (the session reloads the signed-in user with it). Returns the unsubscribe. */
export const onRefresh = (fn: () => void) => {
  subscribe(fn);
  return () => void listeners.delete(fn);
};

export type ApiState<T> = { data: T | undefined; error: string | null; status: number | null; loading: boolean; reload: () => void };

/** GET path (null = don't load yet). Keeps showing the previous data while reloading. */
export function useApi<T>(path: string | null): ApiState<T> {
  const gen = useSyncExternalStore(subscribe, () => generation, () => 0);
  const [state, setState] = useState<{ data?: T; error: string | null; status: number | null; loadedKey: string | null }>({ error: null, status: null, loadedKey: null });
  const key = path === null ? null : `${gen}:${path}`;

  useEffect(() => {
    if (key === null || path === null) return;
    let live = true;
    api<string>(path, { headers: { Accept: "application/json" } }, { raw: true })
      .then((text) => {
        if (live) setState({ data: JSON.parse(text, reviveDates) as T, error: null, status: 200, loadedKey: key });
      })
      .catch((e: Error & { status?: number }) => {
        if (live) setState((s) => ({ data: s.data, error: e.message, status: e.status ?? null, loadedKey: key }));
      });
    return () => {
      live = false;
    };
  }, [key, path]);

  const reload = useCallback(() => refreshData(), []);
  return { data: state.data, error: state.error, status: state.status, loading: state.loadedKey !== key, reload };
}
