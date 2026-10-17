import { describe, expect, it } from "vitest";
import { poTransporter, termsTransporter, withTransport } from "./po-transporter";

const terms = "Delivery Period: Immediate\nTransport: Vijay Lakshmi Transport\nPacking & forwarding: Nil";

describe("poTransporter", () => {
  it("prefers the transporter recorded at dispatch", () => {
    expect(poTransporter({ dispatchTransporter: " VRL Logistics ", terms })).toBe("VRL Logistics");
  });

  it("falls back to the Transport line of the terms", () => {
    expect(poTransporter({ dispatchTransporter: null, terms })).toBe("Vijay Lakshmi Transport");
    expect(poTransporter({ dispatchTransporter: "", terms: "1. Delivery: 3 days\n2. Transporter - Gati" })).toBe("Gati");
    expect(poTransporter({ dispatchTransporter: null, terms: "Transport Name: Thru Courier" })).toBe("Thru Courier");
  });

  it("is null when neither names one", () => {
    expect(poTransporter({ dispatchTransporter: null, terms: "Freight: Extra, To-pay basis" })).toBeNull();
    expect(poTransporter({ dispatchTransporter: null, terms: null })).toBeNull();
    // A blank Transport line doesn't take the next line as the transporter.
    expect(termsTransporter("Transport:\nPacking: Nil")).toBeNull();
  });
});

describe("withTransport", () => {
  it("replaces the Transport line, keeping its numbering", () => {
    expect(withTransport(terms, "Thru Your Vehicle")).toBe("Delivery Period: Immediate\nTransport: Thru Your Vehicle\nPacking & forwarding: Nil");
    expect(withTransport("1. Delivery: now\n2. Transport - Gati\n3. GST: extra", "VRL")).toBe("1. Delivery: now\n2. Transport - VRL\n3. GST: extra");
    expect(withTransport("Transport:\nPacking: Nil", "Courier")).toBe("Transport: Courier\nPacking: Nil");
  });

  it("adds the line when the terms have none", () => {
    expect(withTransport("Delivery: 2-3 days\n", "Courier")).toBe("Delivery: 2-3 days\nTransport: Courier");
    expect(withTransport("", "Courier")).toBe("Transport: Courier");
  });

  it("blanks the line for an empty name, keeping its place", () => {
    const blank = withTransport(terms, "  ");
    expect(blank).toBe("Delivery Period: Immediate\nTransport:\nPacking & forwarding: Nil");
    expect(termsTransporter(blank)).toBeNull();
    expect(withTransport(blank, "Courier")).toBe("Delivery Period: Immediate\nTransport: Courier\nPacking & forwarding: Nil");
    expect(withTransport("Delivery: now", "")).toBe("Delivery: now");
  });
});
