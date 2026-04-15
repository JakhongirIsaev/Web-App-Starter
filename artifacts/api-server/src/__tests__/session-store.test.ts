import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { generateSessionToken, __testing } from "../lib/session-store";

const { hashToken, sessionTtlMs } = __testing;

describe("generateSessionToken", () => {
  it("produces a URL-safe base64 string", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces 256 bits of entropy (43 base64url chars)", () => {
    const token = generateSessionToken();
    expect(token.length).toBe(43);
  });

  it("is not predictable across calls", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    expect(hashToken("same-input")).toBe(hashToken("same-input"));
  });

  it("differs for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("is SHA-256 hex (64 chars)", () => {
    const h = hashToken("any");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    const expected = crypto.createHash("sha256").update("any").digest("hex");
    expect(h).toBe(expected);
  });
});

describe("sessionTtlMs", () => {
  it("defaults to 30 days when env unset", () => {
    const prev = process.env.SESSION_TTL_MS;
    delete process.env.SESSION_TTL_MS;
    try {
      expect(sessionTtlMs()).toBe(30 * 24 * 60 * 60 * 1000);
    } finally {
      if (prev !== undefined) process.env.SESSION_TTL_MS = prev;
    }
  });

  it("uses env value when set to a valid positive number", () => {
    const prev = process.env.SESSION_TTL_MS;
    process.env.SESSION_TTL_MS = "60000";
    try {
      expect(sessionTtlMs()).toBe(60000);
    } finally {
      if (prev === undefined) delete process.env.SESSION_TTL_MS;
      else process.env.SESSION_TTL_MS = prev;
    }
  });

  it("falls back to default when env value is invalid", () => {
    const prev = process.env.SESSION_TTL_MS;
    process.env.SESSION_TTL_MS = "not-a-number";
    try {
      expect(sessionTtlMs()).toBe(30 * 24 * 60 * 60 * 1000);
    } finally {
      if (prev === undefined) delete process.env.SESSION_TTL_MS;
      else process.env.SESSION_TTL_MS = prev;
    }
  });

  it("falls back to default when env value is zero or negative", () => {
    const prev = process.env.SESSION_TTL_MS;
    process.env.SESSION_TTL_MS = "-1";
    try {
      expect(sessionTtlMs()).toBe(30 * 24 * 60 * 60 * 1000);
    } finally {
      if (prev === undefined) delete process.env.SESSION_TTL_MS;
      else process.env.SESSION_TTL_MS = prev;
    }
  });
});
