"use client";

/**
 * Approvals — the "action center" dashboard: what waits for a decision and the decision itself in
 * one place. Status and value cards on top, then one card per item with its approval chain, how
 * much of your approval limit it uses, and Approve / Send back right there. Switch to the overview
 * dashboard (and back) with the switch at the top; the choice is remembered in this browser.
 */
import { useMemo, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, ClockIcon, Loader2Icon, PaperclipIcon, SearchIcon, UndoIcon, ZapIcon } from "lucide-react";
import { approveComparison, rejectComparison } from "@/app/(app)/indents/actions";
import { approveAmendment, approvePurchaseOrder, rejectAmendment, rejectPurchaseOrder } from "@/app/(app)/purchase-orders/actions";
import { holdBill, passBill } from "@/app/(app)/bills/actions";
import { DashboardSwitch } from "@/components/dashboard-switch";
import { EmptyState } from "@/components/empty-state";
import { FileChips } from "@/components/file-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/hooks/use-server-action";
import { formatINR, formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApprovalItem, ApprovalKind, loadApprovals } from "@/lib/screens/approvals";

type Data = Awaited<ReturnType<typeof loadApprovals>>;
export type ApprovalsViewProps = Data;

const KINDS: { key: ApprovalKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "comparison", label: "Comparisons" },
  { key: "po", label: "Purchase orders" },
  { key: "amendment", label: "Amendments" },
  { key: "bill", label: "Bills" },
];
const KIND_TAG: Record<ApprovalKind, string> = { comparison: "Comparison", po: "Purchase order", amendment: "PO amendment", bill: "Bill to pass" };
type Sort = "oldest" | "value" | "newest";

const DAY = 86_400_000;
function waited(since: Date, now: number) {
  const h = (now - since.getTime()) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? "" : "s"}`;
}
const shortDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "");
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function ApprovalsView({ items, stats }: ApprovalsViewProps) {
  const [kind, setKind] = useState<ApprovalKind | "all">("all");
  const [sort, setSort] = useState<Sort>("oldest");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  // "Waiting 2 days" is counted from when the screen opened.
  const [now] = useState(() => Date.now());

  const open = items.filter((i) => !done.has(i.key));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = open.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!onlyMine || i.canAct) &&
        (!q || [i.title, i.ref, i.requester, i.department ?? "", i.detail ?? ""].some((t) => t.toLowerCase().includes(q))),
    );
    return list.sort((a, b) => (sort === "value" ? b.amount - a.amount : sort === "newest" ? b.since.getTime() - a.since.getTime() : a.since.getTime() - b.since.getTime()));
  }, [open, kind, onlyMine, query, sort]);
  const count = (k: ApprovalKind | "all") => open.filter((i) => k === "all" || i.kind === k).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="text-sm text-muted-foreground">Everything waiting for a decision — approve or send back right here.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSort(sort === "oldest" ? "newest" : "oldest")} className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-300">
            <ClockIcon />
            {sort === "oldest" ? "Oldest first" : "Newest first"}
          </Button>
          <DashboardSwitch current="approvals" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatusCard pending={open.length} approved={stats.approvedThisMonth + done.size} sentBack={stats.sentBackThisMonth} mine={open.filter((i) => i.canAct).length} />
        <ValueCard total={open.reduce((s, i) => s + i.amount, 0)} departments={stats.departments} />
        <TodayCard decided={stats.decidedToday + done.size} remaining={open.filter((i) => i.canAct).length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                kind === k.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {k.label} <span className="tabular opacity-80">({count(k.key)})</span>
            </button>
          ))}
        </div>
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, vendor, number…" aria-label="Search approvals" />
        </InputGroup>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border bg-card px-2 text-sm"
          aria-label="Sort"
        >
          <option value="oldest">Waiting longest</option>
          <option value="value">Highest value</option>
          <option value="newest">Newest</option>
        </select>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Only what I can decide
        </label>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={CheckIcon} title={open.length ? "Nothing matches" : "All clear"} description={open.length ? "Change the filter or search." : "Nothing is waiting for a decision."} />
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((item) => (
            <ApprovalCard key={item.key} item={item} now={now} onDone={() => setDone((d) => new Set(d).add(item.key))} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cards on top ────────────────────────────────────────────────────────────

function StatusCard({ pending, approved, sentBack, mine }: { pending: number; approved: number; sentBack: number; mine: number }) {
  const total = pending + approved + sentBack || 1;
  const parts = [
    { label: "Pending", value: pending, color: "var(--ring)" },
    { label: "Approved this month", value: approved, color: "var(--primary)" },
    { label: "Sent back / held", value: sentBack, color: "oklch(0.6 0.19 25)" },
  ];
  // Donut from stroke dashes on one circle.
  const R = 34;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Card className="gap-3 p-4">
      <div className="text-sm font-semibold">Approval status</div>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 88 88" className="size-24 shrink-0 -rotate-90" aria-hidden>
          <circle cx="44" cy="44" r={R} fill="none" stroke="var(--muted)" strokeWidth="12" />
          {parts.map((p) => {
            const len = (p.value / total) * C;
            const el = <circle key={p.label} cx="44" cy="44" r={R} fill="none" stroke={p.color} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
          <text x="44" y="49" textAnchor="middle" className="rotate-90 fill-foreground text-[15px] font-semibold" style={{ transformOrigin: "44px 44px", fontFamily: "var(--font-heading)" }}>
            {Math.round((approved / total) * 100)}%
          </text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                {p.label}
              </span>
              <span className="figure font-semibold">{p.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{mine} need your decision</p>
    </Card>
  );
}

function ValueCard({ total, departments }: { total: number; departments: { name: string; value: number }[] }) {
  const top = departments.slice(0, 3);
  const rest = departments.slice(3).reduce((s, d) => s + d.value, 0);
  const segs = [...top, ...(rest > 0 ? [{ name: "Others", value: rest }] : [])].filter((d) => d.value > 0);
  const colors = ["var(--primary)", "var(--ring)", "oklch(0.6 0.1 190)", "oklch(0.7 0.02 80)"];
  const sum = segs.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <Card className="gap-3 p-4">
      <div className="text-sm font-semibold">Pending value</div>
      <div className="figure text-3xl font-semibold">{formatINRCompact(total)}</div>
      {segs.length > 0 && (
        <>
          <div className="flex gap-3 text-xs">
            {segs.map((d, i) => (
              <div key={d.name} className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: colors[i] }} />
                  <span className="truncate">{d.name}</span>
                </div>
                <div className="text-muted-foreground tabular">{Math.round((d.value / sum) * 100)}%</div>
              </div>
            ))}
          </div>
          <div className="flex h-2.5 gap-1 overflow-hidden rounded-full">
            {segs.map((d, i) => (
              <div key={d.name} className="h-full rounded-full" style={{ width: `${(d.value / sum) * 100}%`, background: colors[i] }} title={`${d.name}: ${formatINR(d.value)}`} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function TodayCard({ decided, remaining }: { decided: number; remaining: number }) {
  const total = decided + remaining;
  const pct = total ? Math.round((decided / total) * 100) : 100;
  const N = 18;
  const lit = Math.round((pct / 100) * N);
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Today</span>
        <span className="text-xs text-muted-foreground">decided · left for you</span>
      </div>
      <div className="relative mx-auto h-24 w-48">
        <svg viewBox="0 0 200 104" className="h-full w-full" aria-hidden>
          {Array.from({ length: N }, (_, i) => {
            const a = Math.PI - (i / (N - 1)) * Math.PI;
            const x1 = 100 + Math.cos(a) * 62;
            const y1 = 98 - Math.sin(a) * 62;
            const x2 = 100 + Math.cos(a) * 92;
            const y2 = 98 - Math.sin(a) * 92;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="9" strokeLinecap="round" stroke={i < lit ? "var(--primary)" : "var(--muted)"} />;
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="figure text-xl font-semibold">{pct}%</div>
        </div>
      </div>
      <div className="flex justify-between px-6 text-xs text-muted-foreground tabular">
        <span>{decided} decided</span>
        <span>{remaining} left</span>
      </div>
    </Card>
  );
}

// ── One item ────────────────────────────────────────────────────────────────

function ApprovalCard({ item, now, onDone }: { item: ApprovalItem; now: number; onDone: () => void }) {
  const router = useRouter();
  const [pending, run] = useServerAction();
  const [confirming, setConfirming] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  const days = (now - item.since.getTime()) / DAY;
  const approveLabel = item.kind === "bill" ? "Pass for payment" : "Approve";
  const backLabel = item.kind === "bill" ? "Hold" : "Send back";

  function approve() {
    const action =
      item.kind === "comparison"
        ? () => approveComparison(item.id, "")
        : item.kind === "po"
          ? () => approvePurchaseOrder(item.id)
          : item.kind === "amendment"
            ? () => approveAmendment(item.id, "")
            : () => passBill(item.id);
    run(action as () => ReturnType<typeof passBill>, {
      pending: `${approveLabel === "Approve" ? "Approving" : "Passing"} ${item.ref}…`,
      success: `${item.ref} ${item.kind === "bill" ? "passed" : "approved"}`,
      onSuccess: () => {
        onDone();
        router.refresh();
      },
      onError: () => setConfirming(false),
    });
  }
  function sendBack() {
    const reason = (back ?? "").trim();
    const action =
      item.kind === "comparison"
        ? () => rejectComparison(item.id, reason)
        : item.kind === "po"
          ? () => rejectPurchaseOrder(item.id, reason)
          : item.kind === "amendment"
            ? () => rejectAmendment(item.id, reason)
            : () => holdBill(item.id, reason);
    run(action as () => ReturnType<typeof holdBill>, {
      pending: `${item.kind === "bill" ? "Holding" : "Sending back"} ${item.ref}…`,
      success: `${item.ref} ${item.kind === "bill" ? "put on hold" : "sent back"}`,
      onSuccess: () => {
        onDone();
        router.refresh();
      },
    });
  }

  // The papers to check before deciding, next to the decision (set apart so they aren't clicked for Approve).
  const files = item.files.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 sm:ml-2 sm:border-l sm:pl-4">
      <PaperclipIcon className="size-3.5 text-muted-foreground" aria-label="Attachments" />
      <FileChips files={item.files} />
    </div>
  );
  return (
    <Card className={cn("gap-3 p-4 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted text-xs font-semibold" aria-hidden>
          {initials(item.requester)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={item.href} className="truncate text-base font-semibold hover:text-primary hover:underline">
              {item.title}
            </Link>
            <span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{KIND_TAG[item.kind]}</span>
            {item.urgent && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <ZapIcon className="size-3" />
                {item.kind === "bill" ? "MSME due soon" : "Urgent"}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {item.requester}
            {item.department ? ` · ${item.department}` : ""} · {shortDate(item.raisedAt)}
          </div>
          {item.detail && <div className="mt-0.5 text-sm">{item.detail}</div>}
          {item.sentBack && <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Sent back before: {item.sentBack}</div>}
        </div>
        <div className="text-right">
          <div className="figure text-2xl font-semibold">{formatINR(item.amount)}</div>
          <div className="text-xs text-muted-foreground">{item.ref}</div>
          <div className={cn("text-xs", days >= 2 ? "font-medium text-rose-700 dark:text-rose-400" : "text-muted-foreground")}>Waiting {waited(item.since, now)}</div>
        </div>
      </div>

      {/* The approval chain, with this decision highlighted. */}
      <ol className="flex flex-wrap items-center gap-y-2 rounded-md bg-muted/60 px-3 py-2">
        {item.chain.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  s.state === "done" ? "bg-emerald-600 text-white" : s.state === "current" ? "bg-orange-500 text-white" : "bg-card text-muted-foreground ring-1 ring-border",
                )}
              >
                {s.state === "done" ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className="text-xs leading-tight">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-muted-foreground">
                  {s.who ?? "—"}
                  {s.at ? ` · ${shortDate(s.at)}` : ""}
                </span>
              </span>
            </span>
            {i < item.chain.length - 1 && <span className={cn("mx-3 h-px w-8 shrink-0 sm:w-12", s.state === "done" ? "bg-emerald-500" : "bg-border")} aria-hidden />}
          </li>
        ))}
      </ol>

      {/* How much of your approval limit it takes (the "budget" of a decision). */}
      {item.limitShare !== null && (
        <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <LimitRing pct={item.limitShare} />
          <div>
            <div className="font-medium">Your approval limit</div>
            <div className="text-xs text-muted-foreground">
              {item.limitShare > 100 ? "Above your limit — needs a higher approver" : `${item.limitShare}% of your limit for this decision`}
            </div>
          </div>
        </div>
      )}

      {item.canAct ? (
        back === null ? (
          <div className="flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={approve} disabled={pending}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                  Confirm {item.kind === "bill" ? "pass" : "approve"} {formatINR(item.amount)}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setConfirming(true)}>
                  <CheckIcon />
                  {approveLabel}
                </Button>
                <Button size="sm" variant="outline" className="text-rose-700 hover:text-rose-700 dark:text-rose-400" onClick={() => setBack("")}>
                  <UndoIcon />
                  {backLabel}
                </Button>
              </>
            )}
            {files}
            <Button size="sm" variant="ghost" asChild className="ml-auto">
              <Link href={item.href}>
                Open details
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea autoFocus rows={2} value={back} onChange={(e) => setBack(e.target.value)} placeholder={item.kind === "bill" ? "Why hold this bill?" : "What should be changed? (sent to whoever raised it)"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="destructive" onClick={sendBack} disabled={pending || back.trim().length < 3}>
                {pending ? <Loader2Icon className="animate-spin" /> : <UndoIcon />}
                {backLabel}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBack(null)} disabled={pending}>
                Cancel
              </Button>
              {files}
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{item.blocked}</span>
          {files}
          <Button size="sm" variant="ghost" asChild className="ml-auto">
            <Link href={item.href}>
              Open details
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}

function LimitRing({ pct }: { pct: number }) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const len = Math.min(1, pct / 100) * C;
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={R} fill="none" stroke="var(--muted)" strokeWidth="5" />
      <circle cx="20" cy="20" r={R} fill="none" stroke={pct > 100 ? "oklch(0.6 0.19 25)" : pct > 75 ? "var(--ring)" : "var(--primary)"} strokeWidth="5" strokeDasharray={`${len} ${C - len}`} strokeLinecap="round" />
      <text x="20" y="24" textAnchor="middle" className="rotate-90 fill-foreground text-[10px] font-semibold" style={{ transformOrigin: "20px 20px" }}>
        {pct}%
      </text>
    </svg>
  );
}
