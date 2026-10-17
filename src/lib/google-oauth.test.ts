import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkGoogleClaims } = await import("./google-oauth");
const { isAllowedEmail } = await import("./auth-config");

const base = {
  nonce: "n1",
  email: "Priya@Example.com",
  email_verified: true,
  hd: "example.com",
  name: "Priya",
};

describe("checkGoogleClaims", () => {
  it("accepts a verified Workspace account in the allowed domain", () => {
    expect(checkGoogleClaims(base, "n1", "example.com")).toEqual({
      ok: true,
      email: "priya@example.com",
      name: "Priya",
    });
  });

  it("rejects a nonce mismatch (replayed token)", () => {
    expect(checkGoogleClaims(base, "other", "example.com")).toEqual({ ok: false, error: "nonce_mismatch" });
  });

  it("rejects personal Gmail accounts, which have no hd claim", () => {
    const claims = { ...base, email: "someone@gmail.com", hd: undefined };
    expect(checkGoogleClaims(claims, "n1", "example.com")).toEqual({ ok: false, error: "not_workspace" });
  });

  it("rejects other Workspace domains", () => {
    const claims = { ...base, email: "x@vendor.com", hd: "vendor.com" };
    expect(checkGoogleClaims(claims, "n1", "example.com")).toEqual({ ok: false, error: "wrong_domain" });
  });

  it("rejects when hd and the email domain disagree", () => {
    const claims = { ...base, email: "x@vendor.com" };
    expect(checkGoogleClaims(claims, "n1", "example.com")).toEqual({ ok: false, error: "wrong_domain" });
  });

  it("rejects unverified emails", () => {
    expect(checkGoogleClaims({ ...base, email_verified: false }, "n1", "example.com")).toEqual({
      ok: false,
      error: "email_unverified",
    });
  });
});

describe("isAllowedEmail", () => {
  it("matches the domain exactly, case-insensitively", () => {
    expect(isAllowedEmail("A@EXAMPLE.COM", "example.com")).toBe(true);
    expect(isAllowedEmail("a@notexample.com", "example.com")).toBe(false);
    expect(isAllowedEmail("a@example.com.evil.io", "example.com")).toBe(false);
  });
  it("allows everyone when no domain is configured", () => {
    expect(isAllowedEmail("a@example.com", "")).toBe(true);
  });
});
