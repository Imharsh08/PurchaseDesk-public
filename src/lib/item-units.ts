import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { ActionError } from "@/lib/action-error";
import { sameUnit, unitFactor, type UnitItem } from "@/lib/units";

/** What unitFactor() needs, as a Prisma select on an item. */
export const unitItemSelect = {
  uom: true,
  packUnit: true,
  packSize: true,
  units: { select: { unit: true, factor: true } },
} satisfies Prisma.ItemSelect;

type Selected = Prisma.ItemGetPayload<{ select: typeof unitItemSelect }>;

export function toUnitItem(i: Selected): UnitItem {
  return {
    uom: i.uom,
    packUnit: i.packUnit,
    packSize: i.packSize === null ? null : toNumber(i.packSize),
    units: i.units.map((u) => ({ unit: u.unit, factor: toNumber(u.factor) })),
  };
}

/** Unit details of these items, in one query. */
export async function loadUnitItems(itemIds: number[]) {
  const ids = [...new Set(itemIds)];
  if (!ids.length) return new Map<number, UnitItem>();
  const items = await db.item.findMany({ where: { id: { in: ids } }, select: { id: true, ...unitItemSelect } });
  return new Map(items.map((i) => [i.id, toUnitItem(i)]));
}

/**
 * The unit an indent / PO line is in: the one asked for when the item converts to it (its pack, a
 * unit conversion, a standard measure), else an error naming the item — otherwise stock and
 * on-order quantities couldn't be added up. No unit asked for: the item's own.
 */
export function lineUnit(item: Selected & { name: string }, asked: string | undefined | null, line: number) {
  if (!asked || sameUnit(asked, item.uom)) return item.uom;
  if (unitFactor(toUnitItem(item), asked) === null) {
    throw new ActionError(`Line ${line}: ${item.name} has no conversion from ${asked} to ${item.uom}. Add it under Items → unit conversions, or order in ${item.uom}.`);
  }
  return asked;
}
