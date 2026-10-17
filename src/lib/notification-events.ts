/**
 * Step emails the admin controls (Settings → Email notifications): for each event, whether it is
 * sent, whether the next step's doers get it, extra To / CC addresses (e.g. accounts@), and which
 * of the record's files go with it. Defaults are what the app always sent: on, to the doers, no
 * extra addresses, no files. "Invoice attached" is new and starts off.
 */
import type { StepCode } from "@/lib/fms-steps";

/** Files an email can carry: the receipt's invoice / bilty / test certificate, the PO copy, the quotations. */
export type AttachKind = "INVOICE" | "BILTY" | "CERT" | "PO" | "QUOTES";

export const ATTACH_LABEL: Record<AttachKind, string> = {
  INVOICE: "Invoice",
  BILTY: "Bilty",
  CERT: "Test certificate",
  PO: "PO copy",
  QUOTES: "Quotations",
};

type EventDef = {
  label: string;
  /** The FMS step this happens at (for grouping; null = outside the steps). */
  step: StepCode | null;
  /** Who "the doers" are for this email. */
  doers: string;
  /** Files that exist at this point and may be attached. */
  attach: AttachKind[];
  /** Off until the admin turns it on (new emails). */
  defaultOff?: boolean;
  /** Attached by default. */
  defaultAttach?: AttachKind[];
};

export const NOTIFICATION_EVENTS = {
  indentRaised: { label: "Indent raised", step: "ST1", doers: "ST1 doers (get quotations)", attach: [] },
  comparisonSubmitted: { label: "Comparison sent for approval", step: "ST2", doers: "ST2 approvers whose limit covers it", attach: ["QUOTES"] },
  comparisonSentBack: { label: "Comparison sent back", step: "ST2", doers: "Who submitted the comparison", attach: [] },
  comparisonApproved: { label: "Vendor selection approved", step: "ST3", doers: "ST3 doers (create & send PO) and who raised the indent", attach: ["QUOTES"] },
  poSubmitted: { label: "PO sent for approval", step: "ST2", doers: "PO approvers whose limit covers it", attach: ["PO"] },
  dispatched: { label: "Vendor dispatched", step: "ST4", doers: "ST5 doers (receive material)", attach: ["PO"] },
  received: { label: "Material received", step: "ST5", doers: "ST6 doers (quality & quantity check)", attach: ["INVOICE", "BILTY", "PO"] },
  invoiceAttached: {
    label: "Invoice attached to a receipt",
    step: "ST5",
    doers: "ST9 doers (accounts)",
    attach: ["INVOICE", "BILTY", "PO"],
    defaultOff: true,
    defaultAttach: ["INVOICE"],
  },
  checked: { label: "Check done", step: "ST6", doers: "ST8 doers (store & Tally)", attach: ["INVOICE", "CERT"] },
  rejected: { label: "Material rejected in the check", step: "ST7", doers: "ST7 doers (return to vendor)", attach: ["INVOICE", "CERT"] },
  vendorIssue: { label: "Vendor issue raised", step: null, doers: "Users who resolve vendor issues", attach: ["INVOICE", "CERT"] },
  stored: { label: "Material stored", step: "ST8", doers: "ST9 doers (enter the bill)", attach: ["INVOICE", "BILTY", "PO"] },
  billEntered: { label: "Bill entered", step: "ST9", doers: "Users who pass bills", attach: ["INVOICE", "PO"] },
  billPassed: { label: "Bill passed for payment", step: "ST9", doers: "Users who record payments", attach: ["INVOICE"] },
  amendmentRequested: { label: "PO amendment requested", step: null, doers: "PO approvers whose limit covers it", attach: ["PO"] },
  amendmentApproved: { label: "PO amendment approved", step: null, doers: "Who requested the amendment", attach: ["PO"] },
  amendmentSentBack: { label: "PO amendment sent back", step: null, doers: "Who requested the amendment", attach: [] },
} satisfies Record<string, EventDef>;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export const EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];
export const eventDef = (key: NotificationEvent): EventDef => NOTIFICATION_EVENTS[key];

export type EventSetting = {
  on: boolean;
  /** Send to the event's doers (the people who do the next step). */
  doers: boolean;
  to: string[];
  cc: string[];
  attach: AttachKind[];
};
export type NotificationSettings = Record<NotificationEvent, EventSetting>;

export const MAX_EXTRA_ADDRESSES = 10;
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const isEmail = (s: string) => EMAIL.test(s);

/** "a@x.com, b@y.com; c@z.com" → the addresses, lower-cased, without repeats. */
export function splitAddresses(text: string) {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function defaultSetting(key: NotificationEvent): EventSetting {
  const d = eventDef(key);
  return { on: !d.defaultOff, doers: true, to: [], cc: [], attach: [...(d.defaultAttach ?? [])] };
}

export const DEFAULT_NOTIFICATIONS = Object.fromEntries(EVENT_KEYS.map((k) => [k, defaultSetting(k)])) as NotificationSettings;

type Person = { id: number; name: string; email: string };

/**
 * Who an event's email goes to: the doers (when ticked, never the person who did the step) plus the
 * extra addresses in To, the CC addresses in Cc; each address once. With nobody in To, the CC
 * addresses move up. `greet` is the first name for a single doer, else "all".
 */
export function mailAddresses(setting: EventSetting, doers: Person[], actorId: number) {
  const people = setting.doers ? [...new Map(doers.filter((u) => u.id !== actorId).map((u) => [u.email.toLowerCase(), u])).values()] : [];
  const to = [...new Set([...people.map((u) => u.email.toLowerCase()), ...setting.to])];
  const cc = setting.cc.filter((a) => !to.includes(a));
  const greet = people.length === 1 && to.length === 1 ? people[0].name.split(" ")[0] : "all";
  return to.length ? { to, cc, greet } : { to: cc, cc: [], greet };
}

/** The stored settings (JSON, maybe partial or from an older version) with defaults filled in. */
export function resolveNotifications(raw: unknown): NotificationSettings {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    EVENT_KEYS.map((key) => {
      const base = defaultSetting(key);
      const s = stored[key] && typeof stored[key] === "object" ? (stored[key] as Partial<Record<keyof EventSetting, unknown>>) : {};
      const emails = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isEmail(x)).slice(0, MAX_EXTRA_ADDRESSES) : []);
      const allowed = eventDef(key).attach;
      return [
        key,
        {
          on: typeof s.on === "boolean" ? s.on : base.on,
          doers: typeof s.doers === "boolean" ? s.doers : base.doers,
          to: "to" in s ? emails(s.to) : base.to,
          cc: "cc" in s ? emails(s.cc) : base.cc,
          attach: Array.isArray(s.attach) ? allowed.filter((k) => (s.attach as unknown[]).includes(k)) : base.attach,
        },
      ];
    }),
  ) as NotificationSettings;
}
