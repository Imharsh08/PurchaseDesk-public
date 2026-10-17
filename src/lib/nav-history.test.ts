import { beforeEach, describe, expect, it } from "vitest";
import { backTarget, pageName, recordVisit } from "./nav-history";

const store = new Map<string, string>();
globalThis.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
} as Storage;

const visit = (...urls: string[]) => urls.forEach(recordVisit);

describe("nav history", () => {
  beforeEach(() => store.clear());

  it("goes back to the page the user came from, not the module list", () => {
    visit("/fms?step=S7", "/goods-receipts/new?po=12");
    expect(backTarget("/goods-receipts/new")).toBe("/fms?step=S7");
    // The receipt form is skipped: back from the saved receipt is the FMS sheet, with its filter.
    visit("/goods-receipts/40");
    expect(backTarget("/goods-receipts/40")).toBe("/fms?step=S7");
  });

  it("pops on the way back, so A → B → back → back doesn't ping-pong", () => {
    visit("/approvals", "/purchase-orders/5", "/indents/3");
    expect(backTarget("/indents/3")).toBe("/purchase-orders/5");
    visit("/purchase-orders/5");
    expect(backTarget("/purchase-orders/5")).toBe("/approvals");
  });

  it("keeps one entry per page when only the query changes", () => {
    visit("/fms", "/fms?step=S2", "/purchase-orders/5");
    expect(backTarget("/purchase-orders/5")).toBe("/fms?step=S2");
  });

  it("has nowhere to go when the page was opened directly", () => {
    visit("/purchase-orders/5");
    expect(backTarget("/purchase-orders/5")).toBeNull();
  });

  it("names the target page", () => {
    expect(pageName("/fms?step=S7")).toBe("FMS tracker");
    expect(pageName("/purchase-orders/5")).toBe("Purchase order");
    expect(pageName("/purchase-orders")).toBe("Purchase orders");
    expect(pageName("/")).toBe("Dashboard");
    expect(pageName("/somewhere")).toBe("Back");
  });
});
