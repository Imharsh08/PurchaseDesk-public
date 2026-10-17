import "server-only";

import { db } from "@/lib/db";
import { getCompany } from "@/lib/purchase-orders";
import { placeKey, resolveTransport, type TransportOptions, type UsedTransport } from "@/lib/transport";

const PER_PLACE = 20;

/**
 * The transport list (Settings → Transport), plus the transporters typed at earlier dispatches,
 * grouped by the vendor's place (latest first), so a name entered once is suggested next time.
 */
export async function loadTransportOptions(): Promise<TransportOptions> {
  const [company, dispatched] = await Promise.all([
    getCompany(),
    db.purchaseOrder.findMany({
      where: { dispatchTransporter: { not: null } },
      orderBy: { dispatchedAt: "desc" },
      take: 1000,
      select: { dispatchTransporter: true, vendor: { select: { city: true, address: true } } },
    }),
  ]);
  const settings = resolveTransport(company.transport);
  const used: UsedTransport = {};
  for (const po of dispatched) {
    const key = placeKey(settings.routes, po.vendor);
    const name = po.dispatchTransporter?.replace(/\s+/g, " ").trim();
    if (!key || !name) continue;
    const list = (used[key] ??= []);
    if (list.length < PER_PLACE && !list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
  }
  return { settings, used };
}
