import "server-only";

import { db } from "@/lib/db";
import { assignedNames, loadFms } from "@/lib/fms";
import { FMS_STEPS, canDoStep, type StepCode } from "@/lib/fms-steps";
import { formatDate, formatQty, toNumber } from "@/lib/format";
import { buildComparison, loadIndent } from "@/lib/indents";
import { limitBlock } from "@/lib/approval";
import { getCompany } from "@/lib/purchase-orders";
import { can, isAdmin, isLead } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";

/**
 * An indent page: the indent, its comparative statement, history, RFQ vendors and message, and what
 * this user may do with it (approval limit, own-comparison rule). Null when the indent doesn't exist.
 */
export async function loadIndentScreen(id: number, user: { id: number; name: string; email: string; roles: Role[]; approvalLimit: number | null }) {
  const indent = await loadIndent(id);
  if (!indent) return null;

  const showRfq = indent.status === "OPEN" && can(user.roles, "manageQuotations");
  const [comparison, activity, rfqVendors, company, fms] = await Promise.all([
    indent.quotations.length ? buildComparison(indent) : null,
    db.auditLog.findMany({
      where: { entityType: "indent", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } } },
    }),
    showRfq
      ? db.vendor.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, city: true, items: { where: { active: true, itemId: { in: indent.items.map((i) => i.itemId) } }, select: { id: true } } },
        })
      : Promise.resolve([]),
    showRfq ? getCompany() : Promise.resolve(null),
    // Where the indent is in the FMS steps (the page's timeline): the same rows as the FMS sheet.
    loadFms({ indentId: id }),
  ]);
  const timeline = {
    rows: fms.rows,
    assigned: await assignedNames(fms.tat),
    canDo: Object.fromEntries(FMS_STEPS.map((s) => [s.code, canDoStep(user.roles, s.code)])) as Record<StepCode, boolean>,
  };
  const rfqMessage = [
    "Dear Sir/Madam,",
    "",
    "Please send us your best quotation for the following, with delivery period, payment terms, freight and GST:",
    "",
    ...indent.items.map((i, n) => `${n + 1}. ${i.description} (${i.item.sku}) — ${formatQty(i.quantity)} ${i.uom}${i.remarks ? ` — ${i.remarks}` : ""}`),
    "",
    ...(indent.requiredBy ? [`Required by: ${formatDate(indent.requiredBy)}`] : []),
    `Please quote our reference ${indent.indentNumber}.`,
    "",
    "Regards,",
    user.name,
    company?.name ?? "",
    user.email,
  ].join("\n");

  const isOwnerOrLead = user.id === indent.requestedById || isLead(user.roles);
  const canQuote = can(user.roles, "manageQuotations");
  const approveBlocked = !isAdmin(user.roles) && indent.comparisonSubmittedById === user.id;
  const value = indent.comparisonValue === null ? null : toNumber(indent.comparisonValue);
  const limitNote =
    indent.status === "PENDING_APPROVAL" && value !== null && can(user.roles, "approveComparison") && !approveBlocked
      ? await limitBlock(user, value)
      : null;
  const quoteCount = indent.quotations.length;
  const selectedVendorCount = new Set(
    comparison?.lines.map((l) => l.offers.find((o) => o.quoteItemId === l.selectedQuoteItemId)?.quotationId).filter(Boolean),
  ).size;


  // Only the company name is needed (the RFQ subject).
  return { indent, comparison, activity, rfqVendors, company: company && { name: company.name }, rfqMessage, isOwnerOrLead, canQuote, approveBlocked, value, limitNote, quoteCount, selectedVendorCount, timeline, showRfq };
}
