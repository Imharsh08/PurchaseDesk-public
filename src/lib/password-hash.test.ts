import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
const { hashPassword, isPasswordHash, verifyPassword } = await import("./password-hash");

describe("password hash", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("delete-me-2026");
    expect(isPasswordHash(hash)).toBe(true);
    expect(await verifyPassword("delete-me-2026", hash)).toBe(true);
    expect(await verifyPassword("delete-me-2027", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats old bcrypt hashes as not set", () => {
    expect(isPasswordHash("$2b$12$abcdefghijklmnopqrstuv")).toBe(false);
    expect(isPasswordHash(null)).toBe(false);
  });

  it("fits well inside a 10 ms Worker CPU budget", async () => {
    const hash = await hashPassword("timing");
    await verifyPassword("timing", hash); // key import
    const start = performance.now();
    for (let i = 0; i < 20; i++) await verifyPassword("timing", hash);
    expect((performance.now() - start) / 20).toBeLessThan(2);
  });
});
