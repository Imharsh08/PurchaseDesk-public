import { PurchaseOrdersView } from "@/components/screens/purchase-orders";
import { resolveRange } from "@/lib/date-range";
import { listLimit } from "@/lib/list-limit";
import type { loadPurchaseOrderList } from "@/lib/screens/purchase-orders";
import { useTitle } from "../app-shell";
import { useRangeValue, withRange } from "../date-range";
import { Screen, useApi, useSearchObject } from "../screen";
import { useSession } from "../session";

/** "?a=1&b=2" from the page's query, for passing it on to the API. */
export const queryString = (sp: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p}` : "";
};

export function PurchaseOrdersPage() {
  useTitle("Purchase orders");
  const { me } = useSession();
  const sp = useSearchObject();
  const range = useRangeValue();
  const state = useApi<Awaited<ReturnType<typeof loadPurchaseOrderList>>>(withRange(`/purchase-orders${queryString(sp)}`, range));
  return (
    <Screen state={state}>
      {(d) => <PurchaseOrdersView {...d} query={(sp.q ?? "").trim()} limit={listLimit(sp)} range={resolveRange(range)} sp={sp} user={me!.user} />}
    </Screen>
  );
}
