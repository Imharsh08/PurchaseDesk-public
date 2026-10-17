"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { IMPORT_CHUNK, yes, type ImportKind } from "@/lib/import-spec";
import { GST_STATES, stateName } from "@/lib/states";
import { sameUnit } from "@/lib/units";
import { itemSchema, vendorSchema } from "@/lib/validation";

type Row = { row: number; values: Record<string, unknown> };
type Result = { created: number; updated: number; errors: { row: number; message: string }[] };

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const t = text(v).replace(/,/g, "");
  return t === "" ? "" : t;
};

function message(error: unknown) {
  if (error instanceof ZodError) return error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ");
  if (error instanceof ActionError) return error.message;
  return "Could not be saved";
}

function stateCodeOf(value: unknown) {
  const t = text(value);
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) return t.padStart(2, "0");
  const match = GST_STATES.find((s) => s.name.toLowerCase() === t.toLowerCase());
  if (!match) throw new ActionError(`Unknown state “${t}”`);
  return match.code;
}

const CERT: Record<string, "ISO_9001" | "ISO_OTHER" | "CUSTOMER" | "NONE"> = {
  iso9001: "ISO_9001",
  isoother: "ISO_OTHER",
  iso14001: "ISO_OTHER",
  iso45001: "ISO_OTHER",
  customer: "CUSTOMER",
  customercertified: "CUSTOMER",
  none: "NONE",
  "": "NONE",
};

/** Imports one chunk of rows. Valid rows are saved; invalid ones come back with their row number. */
export async function importRows(kind: ImportKind, rows: Row[]) {
  return runAction(async (): Promise<Result> => {
    const user = await authorize("importData");
    if (!Array.isArray(rows) || rows.length > IMPORT_CHUNK) throw new ActionError("Send at most 100 rows at a time.");
    const result: Result = { created: 0, updated: 0, errors: [] };

    if (kind === "items") {
      const existing = new Set(
        (await db.item.findMany({ where: { sku: { in: rows.map((r) => text(r.values.sku).toUpperCase()) } }, select: { sku: true } })).map((i) => i.sku),
      );
      for (const { row, values: v } of rows) {
        try {
          const input = itemSchema.parse({
            sku: text(v.sku),
            name: text(v.name),
            category: text(v.category),
            uom: text(v.uom),
            hsnCode: text(v.hsnCode),
            gstRate: num(v.gstRate),
            description: text(v.description),
            minStock: num(v.minStock),
            reorderQty: num(v.reorderQty),
            packUnit: text(v.packUnit),
            packSize: num(v.packSize),
            active: true,
          });
          await db.item.upsert({ where: { sku: input.sku }, create: input, update: input });
          if (existing.has(input.sku)) result.updated++;
          else result.created++;
        } catch (error) {
          result.errors.push({ row, message: message(error) });
        }
      }
      revalidatePath("/items");
    }

    if (kind === "vendors") {
      const existing = new Set(
        (await db.vendor.findMany({ where: { code: { in: rows.map((r) => text(r.values.code).toUpperCase()) } }, select: { code: true } })).map((v) => v.code),
      );
      for (const { row, values: v } of rows) {
        try {
          const category = text(v.msmeCategory).toUpperCase();
          const input = vendorSchema.parse({
            code: text(v.code),
            name: text(v.name),
            contactPerson: text(v.contactPerson),
            phone: text(v.phone),
            email: text(v.email),
            address: text(v.address),
            city: text(v.city),
            stateCode: stateCodeOf(v.state),
            pincode: text(v.pincode),
            gstin: text(v.gstin),
            pan: text(v.pan).toUpperCase(),
            paymentTerms: text(v.paymentTerms),
            creditDays: num(v.creditDays),
            leadTimeDays: num(v.leadTimeDays) === "" ? null : num(v.leadTimeDays),
            msme: yes(v.msme),
            msmeCategory: ["MICRO", "SMALL", "MEDIUM"].includes(category) ? category : null,
            msmeNumber: text(v.msmeNumber),
            certification: CERT[text(v.certification).toLowerCase().replace(/[^a-z0-9]/g, "")] ?? "NONE",
            notes: text(v.notes),
            active: true,
          });
          const data = { ...input, state: stateName(input.stateCode) };
          await db.vendor.upsert({ where: { code: input.code }, create: data, update: data });
          if (existing.has(input.code)) result.updated++;
          else result.created++;
        } catch (error) {
          result.errors.push({ row, message: message(error) });
        }
      }
      revalidatePath("/vendors");
    }

    if (kind === "stock") {
      const items = await db.item.findMany({
        where: { sku: { in: rows.map((r) => text(r.values.sku).toUpperCase()) } },
        select: { id: true, sku: true, currentStock: true },
      });
      const bySku = new Map(items.map((i) => [i.sku, i]));
      const now = new Date();
      for (const { row, values: v } of rows) {
        try {
          const item = bySku.get(text(v.sku).toUpperCase());
          if (!item) throw new ActionError(`Item code “${text(v.sku)}” not found. Import items first.`);
          const quantity = Number(num(v.quantity));
          if (num(v.quantity) === "" || !Number.isFinite(quantity) || quantity < 0) throw new ActionError("Stock qty must be 0 or more");
          const optional = (key: string) => {
            const t = num(v[key]);
            if (t === "") return undefined;
            const n = Number(t);
            if (!Number.isFinite(n) || n < 0) throw new ActionError(`${key}: enter a valid number`);
            return n;
          };
          const settings = {
            minStock: optional("minStock"),
            reorderQty: optional("reorderQty"),
            packSize: optional("packSize"),
            ...(text(v.packUnit) ? { packUnit: text(v.packUnit) } : {}),
          };
          await db.$transaction([
            db.stockCount.create({
              data: { itemId: item.id, quantity, previousQty: item.currentStock, note: "Opening stock (Excel import)", countedById: user.id, countedAt: now },
            }),
            db.item.update({
              where: { id: item.id },
              data: { currentStock: quantity, stockUpdatedAt: now, stockUpdatedById: user.id, ...settings },
            }),
          ]);
          result.updated++;
        } catch (error) {
          result.errors.push({ row, message: message(error) });
        }
      }
      revalidatePath("/stock");
    }

    if (kind === "rates") {
      const [vendors, items] = await Promise.all([
        db.vendor.findMany({ where: { code: { in: rows.map((r) => text(r.values.vendorCode).toUpperCase()) } }, select: { id: true, code: true } }),
        db.item.findMany({ where: { sku: { in: rows.map((r) => text(r.values.sku).toUpperCase()) } }, select: { id: true, sku: true } }),
      ]);
      const vendorBy = new Map(vendors.map((v) => [v.code, v.id]));
      const itemBy = new Map(items.map((i) => [i.sku, i.id]));
      const now = new Date();
      for (const { row, values: v } of rows) {
        try {
          const vendorId = vendorBy.get(text(v.vendorCode).toUpperCase());
          const itemId = itemBy.get(text(v.sku).toUpperCase());
          if (!vendorId) throw new ActionError(`Vendor code “${text(v.vendorCode)}” not found`);
          if (!itemId) throw new ActionError(`Item code “${text(v.sku)}” not found`);
          // Blank rate: link only, and an existing rate is kept.
          const rate = num(v.rate) === "" ? null : Number(num(v.rate));
          if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new ActionError("Enter a valid rate or leave it blank");
          const lead = num(v.leadTimeDays) === "" ? null : Math.round(Number(num(v.leadTimeDays)));
          if (lead !== null && (!Number.isFinite(lead) || lead < 0 || lead > 365)) throw new ActionError("Lead time must be 0–365 days");
          const notes = text(v.notes).slice(0, 500);
          const data = {
            ...(rate !== null ? { rate, rateSource: "MANUAL" as const, rateDate: now } : {}),
            ...(text(v.vendorItemCode) ? { vendorItemCode: text(v.vendorItemCode) } : {}),
            ...(lead !== null ? { leadTimeDays: lead } : {}),
            ...(notes ? { notes } : {}),
            preferred: yes(v.preferred),
            active: true,
          };
          const found = await db.vendorItem.findUnique({ where: { vendorId_itemId: { vendorId, itemId } }, select: { id: true } });
          await db.vendorItem.upsert({ where: { vendorId_itemId: { vendorId, itemId } }, create: { vendorId, itemId, ...data }, update: data });
          if (found) result.updated++;
          else result.created++;
        } catch (error) {
          result.errors.push({ row, message: message(error) });
        }
      }
      revalidatePath("/vendors");
    }

    if (kind === "units") {
      const items = await db.item.findMany({
        where: { sku: { in: rows.map((r) => text(r.values.sku).toUpperCase()) } },
        select: { id: true, sku: true, uom: true, units: { select: { id: true, unit: true } } },
      });
      const itemBy = new Map(items.map((i) => [i.sku, i]));
      for (const { row, values: v } of rows) {
        try {
          // Rows left blank in the sheet are skipped quietly: only filled ones are conversions.
          if (num(v.itemQty) === "") continue;
          const item = itemBy.get(text(v.sku).toUpperCase());
          if (!item) throw new ActionError(`Item code “${text(v.sku)}” not found`);
          const unit = text(v.unit).slice(0, 20);
          if (!unit) throw new ActionError("Enter the unit");
          if (sameUnit(unit, item.uom)) throw new ActionError(`${unit} is the item's own unit; no conversion needed`);
          const unitQty = num(v.unitQty) === "" ? 1 : Number(num(v.unitQty));
          const itemQty = Number(num(v.itemQty));
          if (!Number.isFinite(unitQty) || unitQty <= 0) throw new ActionError("“Qty in this unit” must be more than 0");
          if (!Number.isFinite(itemQty) || itemQty < 0) throw new ActionError("“= Qty in item unit” must be a number");
          const found = item.units.find((u) => sameUnit(u.unit, unit));
          if (itemQty === 0) {
            if (found) {
              await db.itemUnit.delete({ where: { id: found.id } });
              result.updated++;
            }
            continue;
          }
          const factor = itemQty / unitQty;
          if (factor > 1e8 || factor < 1e-8) throw new ActionError("That conversion looks wrong; check both quantities");
          if (found) await db.itemUnit.update({ where: { id: found.id }, data: { unit, factor } });
          else {
            const created = await db.itemUnit.create({ data: { itemId: item.id, unit, factor } });
            item.units.push({ id: created.id, unit });
          }
          if (found) result.updated++;
          else result.created++;
        } catch (error) {
          result.errors.push({ row, message: message(error) });
        }
      }
      revalidatePath("/items");
      revalidatePath("/stock");
      revalidatePath("/reports");
    }

    if (result.created || result.updated) {
      await audit({
        userId: user.id,
        action: "import",
        entityType: "settings",
        entityId: 1,
        description: `Excel import (${kind}): ${result.created} added, ${result.updated} updated${result.errors.length ? `, ${result.errors.length} rejected` : ""}`,
      });
    }
    return result;
  });
}
