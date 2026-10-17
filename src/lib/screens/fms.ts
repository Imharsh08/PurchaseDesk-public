import "server-only";

import { FMS_HISTORY } from "@/lib/screens/options";

import type { Role } from "@/generated/prisma/enums";
import type { DateRange } from "@/lib/date-range";
import { assignedNames, loadFms } from "@/lib/fms";
import { FMS_STEPS, canDoStep, type StepCode } from "@/lib/fms-steps";

/**
 * FMS tracker. Sheet: indents raised in the top-bar date range; else open rows only unless a history
 * length is asked for. Scorecard (its own periods): open rows + the last ~2 months — the scorecards
 * themselves are worked out from these rows (src/lib/fms-score, also usable in the browser).
 */
export async function loadFmsScreen({
  view,
  days: daysParam,
  range,
  user,
}: {
  view: string | undefined;
  days: string | undefined;
  range: DateRange | null;
  user: { id: number; roles: Role[] };
}) {
  const score = view === "score";
  const days = FMS_HISTORY.find((d) => String(d) === daysParam) ?? null;
  const { rows, tat } = await loadFms(score ? { open: true, days: 70 } : range ? { range } : days ? { days } : { open: true });
  const assigned = await assignedNames(tat);
  const steps = <T,>(fn: (code: StepCode) => T) => Object.fromEntries(FMS_STEPS.map((s) => [s.code, fn(s.code)])) as Record<StepCode, T>;
  // Allowed: role permits the step. Mine: I'm an assigned doer, or nobody is assigned and my role allows it.
  const canDo = steps((code) => canDoStep(user.roles, code));
  const mine = steps((code) => (tat[code].doers.length ? tat[code].doers.includes(user.id) : canDo[code]));
  return { view: score ? ("score" as const) : ("sheet" as const), days, rows, tat, assigned, canDo, mine };
}

export { FMS_HISTORY } from "@/lib/screens/options";
