import "server-only";

import { defaultAddressText, listAddresses } from "@/lib/addresses";
import { db } from "@/lib/db";
import { toUnitItem, unitItemSelect } from "@/lib/item-units";
import { getCompany } from "@/lib/purchase-orders";
import { loadTransportOptions } from "@/lib/transport-data";
import type { ItemOption, VendorOption } from "./po-form";

/** Options for the PO form. Includes `keepIds` so an inactive vendor/item already on a draft still shows. */
export async function loadPOFormOptions(keep: { vendorId?: number; itemIds?: number[] } = {}) {
  const [vendors, items, company, addresses, transport] = await Promise.all([
    db.vendor.findMany({
      where: { OR: [{ active: true }, ...(keep.vendorId ? [{ id: keep.vendorId }] : [])] },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        stateCode: true,
        gstin: true,
        email: true,
        paymentTerms: true,
        leadTimeDays: true,
        address: true,
        preferredTransport: true,
      },
    }),
    db.item.findMany({
      where: { OR: [{ active: true }, { id: { in: keep.itemIds ?? [] } }] },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, hsnCode: true, gstRate: true, category: true, preferredTransport: true, ...unitItemSelect },
    }),
    getCompany(),
    listAddresses(),
    loadTransportOptions(),
  ]);

  return {
    vendors: vendors satisfies VendorOption[],
    items: items.map((i) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      uom: i.uom,
      hsnCode: i.hsnCode,
      gstRate: Number(i.gstRate),
      category: i.category,
      preferredTransport: i.preferredTransport,
      unitItem: toUnitItem(i),
    })) satisfies ItemOption[],
    company: { name: company.name, stateCode: company.stateCode },
    addresses,
    defaultAddresses: defaultAddressText(addresses, company),
    defaultTerms: company.defaultTerms ?? "",
    transport,
  };
}
