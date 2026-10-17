import "server-only";

import { after } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { canDoStep, resolveTat, type StepCode } from "@/lib/fms-steps";
import { sendAs } from "@/lib/gmail";
import type { MailAttachment } from "@/lib/mime";
import { ATTACH_LABEL, mailAddresses, resolveNotifications, type AttachKind, type NotificationEvent } from "@/lib/notification-events";
import { generateAndStorePOPdf, getActivePOPdf, getCompany, renderPOPdf } from "@/lib/purchase-orders";
import { can, type Permission } from "@/lib/roles";
import { readStoredFile } from "@/lib/storage";

/**
 * Step notifications: when someone finishes a step, the people responsible for the next one get an
 * email, sent from the actor's own Gmail ("send as me"). What each event sends — on/off, to the
 * doers or not, extra To / CC, which files — is set by the admin (src/lib/notification-events.ts).
 * Runs after the response (never slows or fails the action); skipped if the actor hasn't connected Gmail.
 */

type Actor = { id: number; name: string; email: string; gmailConnected: boolean };
type Recipient = { id: number; name: string; email: string; roles: Role[] };

const activeUsers = () =>
  db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, roles: true, approvalLimit: true } });

/** Assigned doers of an FMS step, or everyone whose role allows it when none are assigned. */
export async function stepDoers(step: StepCode, filter?: (u: Recipient & { approvalLimit: unknown }) => boolean) {
  const [company, users] = await Promise.all([getCompany(), activeUsers()]);
  const assigned = resolveTat(company.tat)[step].doers;
  const list = assigned.length ? users.filter((u) => assigned.includes(u.id)) : users.filter((u) => canDoStep(u.roles, step));
  return filter ? list.filter(filter) : list;
}

export async function usersWith(permission: Permission) {
  return (await activeUsers()).filter((u) => can(u.roles, permission));
}

export async function usersById(ids: (number | null | undefined)[]) {
  const wanted = ids.filter((id): id is number => typeof id === "number");
  return wanted.length ? (await activeUsers()).filter((u) => wanted.includes(u.id)) : [];
}

/** The records whose files may be attached (the admin picks which kinds, per event). */
export type FileSource = { grnId?: number | null; poId?: number | null; indentId?: number | null };
type Mail = { subject: string; lines: string[]; link: string; files?: FileSource };

/** Gmail takes up to 35 MB a message, and attachments grow by a third when encoded: stay well under. */
const MAX_ATTACHED = 20 * 1024 * 1024;
const DOC_TYPE = { INVOICE: "INVOICE", BILTY: "BILTY", CERT: "QUALITY_CERT" } as const;
const TYPE_BY_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const typeOf = (name: string) => TYPE_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

type Loaded = { label: string; file: () => Promise<MailAttachment> };

/** The files of the chosen kinds that exist on these records (each read only when it is attached). */
async function findFiles(kinds: AttachKind[], src: FileSource, actorId: number): Promise<Loaded[]> {
  const found: Loaded[] = [];
  const docKinds = kinds.filter((k): k is keyof typeof DOC_TYPE => k in DOC_TYPE);
  if (docKinds.length && src.grnId) {
    const docs = await db.document.findMany({
      where: { grnId: src.grnId, status: "ACTIVE", type: { in: docKinds.map((k) => DOC_TYPE[k]) } },
      orderBy: { createdAt: "asc" },
      select: { type: true, fileName: true, storagePath: true, mimeType: true },
    });
    for (const k of docKinds)
      for (const d of docs.filter((d) => d.type === DOC_TYPE[k]))
        found.push({
          label: `${ATTACH_LABEL[k]} (${d.fileName})`,
          file: async () => ({ filename: d.fileName, contentType: d.mimeType, content: await readStoredFile(d.storagePath) }),
        });
  }
  if (kinds.includes("PO") && src.poId) {
    const poId = src.poId;
    const po = await db.purchaseOrder.findUnique({ where: { id: poId }, select: { poNumber: true } });
    if (po)
      found.push({
        label: po.poNumber ? `PO copy (${po.poNumber})` : "PO copy (draft)",
        file: async () => {
          if (!po.poNumber) return { filename: `DRAFT-PO-${poId}.pdf`, contentType: "application/pdf", content: (await renderPOPdf(poId)).pdf };
          const doc = (await getActivePOPdf(poId)) ?? (await generateAndStorePOPdf(poId, actorId));
          return { filename: doc.fileName, contentType: "application/pdf", content: await readStoredFile(doc.storagePath) };
        },
      });
  }
  if (kinds.includes("QUOTES") && src.indentId) {
    const quotes = await db.quotation.findMany({
      where: { indentId: src.indentId, attachmentPath: { not: null } },
      orderBy: { id: "asc" },
      select: { attachmentPath: true, attachmentName: true, vendor: { select: { name: true } } },
    });
    for (const q of quotes) {
      const ext = q.attachmentPath!.split(".").pop() ?? "pdf";
      const name = `Quotation ${q.vendor.name}.${ext}`.replace(/[\\/:*?"<>|]+/g, "-");
      found.push({
        label: `Quotation (${q.vendor.name})`,
        file: async () => ({ filename: q.attachmentName ?? name, contentType: typeOf(q.attachmentName ?? name), content: await readStoredFile(q.attachmentPath!) }),
      });
    }
  }
  return found;
}

/** Reads the files, up to the size limit; the rest are named in the email as "open in PurchaseDesk". */
async function attachFiles(kinds: AttachKind[], src: FileSource | undefined, actorId: number) {
  const attachments: MailAttachment[] = [];
  const attached: string[] = [];
  const left: string[] = [];
  if (!kinds.length || !src) return { attachments, attached, left };
  let total = 0;
  for (const f of await findFiles(kinds, src, actorId)) {
    try {
      const file = await f.file();
      if (total + file.content.byteLength > MAX_ATTACHED) {
        left.push(f.label);
        continue;
      }
      total += file.content.byteLength;
      attachments.push(file);
      attached.push(f.label);
    } catch (error) {
      console.error("Notification attachment failed", f.label, error);
      left.push(f.label);
    }
  }
  return { attachments, attached, left };
}

export function notify(actor: Actor, event: NotificationEvent, recipients: () => Promise<Recipient[] | Recipient[][]>, content: Mail | (() => Promise<Mail>)) {
  if (!actor.gmailConnected) return;
  after(async () => {
    let subject = "";
    try {
      const setting = resolveNotifications((await getCompany()).notifications)[event];
      if (!setting.on) return;
      const doers = setting.doers ? (await recipients()).flat() : [];
      const { to, cc, greet } = mailAddresses(setting, doers, actor.id);
      if (!to.length) return;
      const mail = typeof content === "function" ? await content() : content;
      subject = mail.subject;
      const files = await attachFiles(setting.attach, mail.files, actor.id);
      const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
      const text = [
        `Hi ${greet},`,
        "",
        ...mail.lines,
        ...(files.attached.length ? ["", `Attached: ${files.attached.join(", ")}.`] : []),
        ...(files.left.length ? ["", `Not attached (too large or unavailable) — open it in PurchaseDesk: ${files.left.join(", ")}.`] : []),
        "",
        `Open: ${base}${mail.link}`,
        "",
        actor.name,
        "(sent via PurchaseDesk)",
      ].join("\n");
      await sendAs(actor, { to, cc, subject: `[PurchaseDesk] ${mail.subject}`, text, attachments: files.attachments });
    } catch (error) {
      console.error("Notification failed", event, subject, error);
    }
  });
}
