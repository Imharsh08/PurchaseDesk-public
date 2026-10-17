"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { canDoStep, resolveTat, type StepCode } from "@/lib/fms-steps";
import { EVENT_KEYS, MAX_EXTRA_ADDRESSES, eventDef, isEmail, resolveNotifications, type NotificationEvent } from "@/lib/notification-events";
import { DEFAULT_COMPANY, poCounterKey } from "@/lib/purchase-orders";
import { roleNames } from "@/lib/roles";
import { stateName } from "@/lib/states";
import { saveFile } from "@/lib/storage";
import { MAX_ROUTES, resolveTransport } from "@/lib/transport";
import { companySchema, type CompanyInput } from "@/lib/validation";

export async function saveCompanySettings(raw: CompanyInput) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const { nextPoNumber, ...input } = companySchema.parse(raw);
    const data = { ...input, state: stateName(input.stateCode) };

    await db.$transaction(async (tx) => {
      await tx.companySettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      if (nextPoNumber !== null) {
        // The counter stores the last issued number. Never move it backwards: that would reissue numbers.
        const key = poCounterKey(input.poNumberStyle);
        const current = (await tx.counter.findUnique({ where: { key } }))?.value ?? 0;
        if (nextPoNumber - 1 < current) {
          throw new ActionError(`The next PO number must be at least ${current + 1}; ${current} has already been issued.`);
        }
        await tx.counter.upsert({ where: { key }, create: { key, value: nextPoNumber - 1 }, update: { value: nextPoNumber - 1 } });
      }
    });

    await audit({
      userId: user.id,
      action: "update",
      entityType: "settings",
      entityId: 1,
      description: `Company settings updated${nextPoNumber !== null ? ` (next PO number ${nextPoNumber})` : ""}`,
    });
    revalidatePath("/", "layout");
  });
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const SLOTS = { logo: "logoPath", logo2: "logo2Path" } as const;
type Slot = keyof typeof SLOTS;

export async function uploadCompanyLogo(slot: Slot, formData: FormData) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    if (!(slot in SLOTS)) throw new ActionError("Unknown logo.");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose an image to upload.");
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new ActionError("Logo must be a PNG or JPG image.");
    if (file.size > 1024 * 1024) throw new ActionError("Logo must be smaller than 1 MB.");

    const stored = await saveFile(`branding/${slot}-${Date.now()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
    // Logos can be uploaded before the company details are saved: create the settings row if needed.
    await db.companySettings.upsert({
      where: { id: 1 },
      create: { ...DEFAULT_COMPANY, tat: undefined, notifications: undefined, transport: undefined, updatedAt: new Date(), [SLOTS[slot]]: stored.storagePath },
      update: { [SLOTS[slot]]: stored.storagePath },
    });
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: `Company ${slot === "logo" ? "logo" : "second logo"} updated` });
    revalidatePath("/settings");
  });
}

export async function removeCompanyLogo(slot: Slot) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    if (!(slot in SLOTS)) throw new ActionError("Unknown logo.");
    await db.companySettings.update({ where: { id: 1 }, data: { [SLOTS[slot]]: null } });
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: `Company ${slot === "logo" ? "logo" : "second logo"} removed` });
    revalidatePath("/settings");
  });
}

const tatSchema = z.object({
  countSundays: z.boolean(),
  tat: z.record(
    z.enum(["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7", "ST8", "ST9"]),
    z.object({
      normal: z.number("Enter hours").min(0).max(24 * 120),
      urgent: z.number("Enter hours").min(0).max(24 * 120),
      doers: z.array(z.number().int().positive()).max(50).default([]),
    }),
  ),
});

/** FMS turnaround times per step. */
export async function saveTatSettings(raw: z.input<typeof tatSchema>) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const input = tatSchema.parse(raw);
    // Doers must be active users whose role allows the step (e.g. only approvers for ST2).
    const ids = [...new Set(Object.values(input.tat).flatMap((t) => t.doers))];
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, roles: true, active: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const [code, t] of Object.entries(input.tat) as [StepCode, (typeof input.tat)[StepCode]][]) {
      for (const id of t.doers) {
        const u = byId.get(id);
        if (!u || !u.active) throw new ActionError(`${code}: one of the doers is no longer an active user.`);
        if (!canDoStep(u.roles, code)) {
          throw new ActionError(`${code}: ${u.name} (${roleNames(u.roles)}) can't do this step with their roles. Add a role in Users or pick someone else.`);
        }
      }
    }
    // Nothing changed (saved twice): no write, no history entry.
    const stored = await db.companySettings.findUnique({ where: { id: 1 }, select: { tat: true, tatCountSundays: true } });
    if (stored && stored.tatCountSundays === input.countSundays && JSON.stringify(resolveTat(stored.tat)) === JSON.stringify(resolveTat(input.tat))) return;
    await db.companySettings.upsert({
      where: { id: 1 },
      create: { ...DEFAULT_COMPANY, notifications: undefined, transport: undefined, updatedAt: new Date(), tat: input.tat, tatCountSundays: input.countSundays },
      update: { tat: input.tat, tatCountSundays: input.countSundays },
    });
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: "FMS turnaround times updated" });
    revalidatePath("/settings");
    revalidatePath("/fms");
  });
}

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isEmail, { error: (issue) => `“${String(issue.input)}” isn't an email address.` });

const notificationsSchema = z.record(
  z.enum(EVENT_KEYS as [NotificationEvent, ...NotificationEvent[]]),
  z.object({
    on: z.boolean(),
    doers: z.boolean(),
    to: z.array(emailAddress).max(MAX_EXTRA_ADDRESSES),
    cc: z.array(emailAddress).max(MAX_EXTRA_ADDRESSES),
    attach: z.array(z.enum(["INVOICE", "BILTY", "CERT", "PO", "QUOTES"])).max(5),
  }),
);

/** Which step emails are sent, to whom (doers, extra To, CC) and with which files. */
export async function saveNotificationSettings(raw: z.input<typeof notificationsSchema>) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const input = notificationsSchema.parse(raw);
    for (const [key, s] of Object.entries(input) as [NotificationEvent, (typeof input)[NotificationEvent]][]) {
      if (s.on && !s.doers && !s.to.length && !s.cc.length) {
        throw new ActionError(`“${eventDef(key).label}” is on but goes to nobody. Tick the doers, add an address, or turn it off.`);
      }
    }
    // Only files that exist at that point (e.g. no invoice when an indent is raised); full set of events.
    const notifications = resolveNotifications(input);
    // Nothing changed (saved twice): no write, no history entry.
    const stored = await db.companySettings.findUnique({ where: { id: 1 }, select: { notifications: true } });
    if (JSON.stringify(resolveNotifications(stored?.notifications)) === JSON.stringify(notifications) && stored?.notifications) return;
    await db.companySettings.upsert({
      where: { id: 1 },
      create: { ...DEFAULT_COMPANY, tat: undefined, transport: undefined, updatedAt: new Date(), notifications },
      update: { notifications },
    });
    const on = EVENT_KEYS.filter((k) => notifications[k].on).length;
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: `Email notifications updated (${on} of ${EVENT_KEYS.length} on)` });
    revalidatePath("/settings");
  });
}

const transportSchema = z.object({
  destination: z.string().trim().max(100),
  routes: z
    .array(z.object({ city: z.string().trim().min(1, "City is required").max(60), name: z.string().trim().min(1, "Transporter is required").max(100) }))
    .max(MAX_ROUTES, `Up to ${MAX_ROUTES} lines`),
});

/** Inward transport: our shipping place and the transporters that bring material from each vendor city. */
export async function saveTransportSettings(raw: z.input<typeof transportSchema>) {
  return runAction(async () => {
    const user = await authorize("manageSettings");
    const transport = resolveTransport(transportSchema.parse(raw));
    // Nothing changed (saved twice): no write, no history entry.
    const stored = await db.companySettings.findUnique({ where: { id: 1 }, select: { transport: true } });
    if (stored?.transport && JSON.stringify(resolveTransport(stored.transport)) === JSON.stringify(transport)) return;
    await db.companySettings.upsert({
      where: { id: 1 },
      create: { ...DEFAULT_COMPANY, tat: undefined, notifications: undefined, updatedAt: new Date(), transport },
      update: { transport },
    });
    const cities = new Set(transport.routes.map((r) => r.city.toLowerCase())).size;
    await audit({ userId: user.id, action: "update", entityType: "settings", entityId: 1, description: `Transport list updated (${transport.routes.length} transporters for ${cities} cities)` });
    revalidatePath("/settings");
  });
}
