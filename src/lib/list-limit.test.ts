import { describe, expect, it } from "vitest";
import { listLimit, moreHref } from "./list-limit";

describe("listLimit", () => {
  it("defaults to one page of 50", () => {
    expect(listLimit({})).toBe(50);
    expect(listLimit({ limit: "abc" })).toBe(50);
    expect(listLimit({ limit: "10" })).toBe(50);
  });
  it("rounds up to whole pages and caps at 1000", () => {
    expect(listLimit({ limit: "100" })).toBe(100);
    expect(listLimit({ limit: "120" })).toBe(150);
    expect(listLimit({ limit: "99999" })).toBe(1000);
  });
});

describe("moreHref", () => {
  it("keeps the other filters and adds a page", () => {
    expect(moreHref("/purchase-orders", { status: "open", q: "ABC", limit: "50" }, 50)).toBe("/purchase-orders?status=open&q=ABC&limit=100");
  });
});
