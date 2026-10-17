import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { assignedNames, loadFms } from "@/lib/fms";
import { FMS_STEPS, canDoStep, type StepCode } from "@/lib/fms-steps";

/**
 * "Where it is now" for a PO, receipt or bill page: the FMS steps of its indent, narrowed to this PO
 * (quotations and approval, then sending, follow-up and each delivery lot), with who does each and
 * the button for the step that is due. Null for a PO without an indent (not tracked in the FMS).
 */
export async function loadTimeline(indentId: number | null | undefined, poId: number, roles: Role[]) {
  if (!indentId) return null;
  const fms = await loadFms({ indentId });
  const rows = fms.rows.filter((r) => r.poId === poId);
  if (!rows.length) return null;
  const otherPos = new Set(fms.rows.map((r) => r.poId).filter((id) => id !== null && id !== poId)).size;
  return {
    rows,
    indentId,
    indentNumber: rows[0].indentNumber,
    otherPos,
    assigned: await assignedNames(fms.tat),
    canDo: Object.fromEntries(FMS_STEPS.map((s) => [s.code, canDoStep(roles, s.code)])) as Record<StepCode, boolean>,
  };
}

export type Timeline = NonNullable<Awaited<ReturnType<typeof loadTimeline>>>;
