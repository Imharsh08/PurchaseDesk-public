import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATIONS, EVENT_KEYS, mailAddresses, resolveNotifications, splitAddresses, type EventSetting } from "./notification-events";

const setting = (s: Partial<EventSetting> = {}): EventSetting => ({ on: true, doers: true, to: [], cc: [], attach: [], ...s });
const pc = { id: 2, name: "Neha Joshi", email: "PC@example.com" };
const acc = { id: 3, name: "Accounts Team", email: "acc@example.com" };

describe("notification settings", () => {
  it("defaults to what the app always sent: on, to the doers, no extras, no files", () => {
    const s = resolveNotifications(null);
    expect(s.received).toEqual({ on: true, doers: true, to: [], cc: [], attach: [] });
    expect(Object.keys(s)).toEqual(EVENT_KEYS);
  });

  it("starts the new invoice email off, with the invoice ticked", () => {
    expect(DEFAULT_NOTIFICATIONS.invoiceAttached).toMatchObject({ on: false, attach: ["INVOICE"] });
  });

  it("fills in missing events and drops bad addresses and files that don't exist at that point", () => {
    const s = resolveNotifications({
      stored: { on: false, to: ["accounts@example.com", "not-an-email", 7], attach: ["INVOICE", "QUOTES"] },
      unknownEvent: { on: false },
    });
    expect(s.stored).toEqual({ on: false, doers: true, to: ["accounts@example.com"], cc: [], attach: ["INVOICE"] });
    expect(s.received.on).toBe(true);
    expect(s).not.toHaveProperty("unknownEvent");
  });

  it("splits typed addresses on commas, semicolons and spaces, once each", () => {
    expect(splitAddresses(" A@x.com, b@y.com;a@x.com  c@z.com ")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });
});

describe("mail addresses", () => {
  it("sends to the doers but never to the person who did the step", () => {
    expect(mailAddresses(setting(), [pc, acc], pc.id)).toEqual({ to: ["acc@example.com"], cc: [], greet: "Accounts" });
  });

  it("adds the extra To and CC, each address once", () => {
    const r = mailAddresses(setting({ to: ["acc@example.com", "md@example.com"], cc: ["md@example.com", "audit@example.com"] }), [acc], 1);
    expect(r).toEqual({ to: ["acc@example.com", "md@example.com"], cc: ["audit@example.com"], greet: "all" });
  });

  it("leaves the doers out when unticked, and moves CC up when nobody is in To", () => {
    expect(mailAddresses(setting({ doers: false, cc: ["audit@example.com"] }), [acc], 1)).toEqual({ to: ["audit@example.com"], cc: [], greet: "all" });
    expect(mailAddresses(setting({ doers: false }), [acc], 1).to).toEqual([]);
  });
});
