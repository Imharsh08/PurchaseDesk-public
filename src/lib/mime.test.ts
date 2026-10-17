import { describe, expect, it } from "vitest";
import { buildMime, encodeHeader, toGmailRaw } from "./mime";

const from = { name: "Amit Gupta", email: "amit@example.com" };

describe("buildMime", () => {
  it("plain text message", () => {
    const m = buildMime({ from, to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], subject: "PO-2026-0090", text: "Hello" }, "t");
    expect(m).toContain('From: "Amit Gupta" <amit@example.com>');
    expect(m).toContain("To: a@x.com, b@x.com");
    expect(m).toContain("Cc: c@x.com");
    expect(m).toContain("Subject: PO-2026-0090");
    expect(m).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(m).toContain(Buffer.from("Hello").toString("base64"));
  });

  it("encodes non-ASCII subject (₹) and strips header injection", () => {
    const m = buildMime({ from, to: ["a@x.com\r\nBcc: evil@x.com"], subject: "Total ₹1,000\r\nBcc: x", text: "x" }, "t");
    expect(m).toContain(`Subject: ${encodeHeader("Total ₹1,000 Bcc: x")}`);
    expect(m).not.toMatch(/\r\nBcc:/);
  });

  it("multipart with attachment", () => {
    const m = buildMime(
      { from, to: ["a@x.com"], subject: "PO", text: "See attached", attachments: [{ filename: "PO-1.pdf", content: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }] },
      "t",
    );
    expect(m).toContain('Content-Type: multipart/mixed; boundary="mix_t"');
    expect(m).toContain('Content-Disposition: attachment; filename="PO-1.pdf"');
    expect(m).toContain("JVBERg=="); // "%PDF"
    expect(m.trimEnd().endsWith("--mix_t--")).toBe(true);
  });

  it("raw is base64url", () => {
    expect(toGmailRaw("a?b>c")).not.toMatch(/[+/=]/);
  });
});
