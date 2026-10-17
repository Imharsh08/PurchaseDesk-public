import "server-only";

import type { CompanySettings } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { stateName } from "@/lib/states";

export type AddressOption = {
  id: number;
  label: string;
  details: string;
  defaultBilling: boolean;
  defaultShipping: boolean;
};

const addressSelect = { id: true, label: true, details: true, defaultBilling: true, defaultShipping: true } as const;

/** Active address book entries, defaults first. */
export function listAddresses(): Promise<AddressOption[]> {
  return db.companyAddress.findMany({
    where: { active: true },
    orderBy: [{ defaultBilling: "desc" }, { defaultShipping: "desc" }, { label: "asc" }],
    select: addressSelect,
  });
}

/** The company's own address as a billing block, for when the address book is empty. */
export function companyAddressText(
  c: Pick<CompanySettings, "name" | "gstin" | "address" | "city" | "stateCode" | "pincode" | "phone" | "billingDetails">,
) {
  if (c.billingDetails?.trim()) return c.billingDetails.trim();
  const lines = c.address
    ? c.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [[c.city, stateName(c.stateCode), c.pincode].filter(Boolean).join(", ")].filter(Boolean);
  return [c.name, c.gstin && `GSTIN: ${c.gstin}`, ...lines, c.phone && `Tel.: ${c.phone}`].filter(Boolean).join("\n");
}

/** Billing and shipping text for a new PO, or when a PO has none saved. */
export function defaultAddressText(
  addresses: AddressOption[],
  company: Parameters<typeof companyAddressText>[0],
): { billing: string; shipping: string } {
  const billing = addresses.find((a) => a.defaultBilling)?.details ?? addresses[0]?.details ?? companyAddressText(company);
  const shipping = addresses.find((a) => a.defaultShipping)?.details ?? billing;
  return { billing, shipping };
}
