import { describe, it, expect, beforeEach } from "vitest";

const TEST_SECRET = "test-secret-32-bytes-long-enough!";

beforeEach(() => {
  process.env.SIGNED_URL_SECRET = TEST_SECRET;
});

// Import after env is set so getSecret() resolves correctly in the module
const { createSignedObjectParams, verifySignedObjectParams } = await import("../lib/signedUrl");

describe("createSignedObjectParams", () => {
  it("returns exp in the future and a 64-char hex sig", () => {
    const { exp, sig, expiresAt } = createSignedObjectParams("/local-objects/docs/photo.jpg");
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
  });

  it("respects custom TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const { exp } = createSignedObjectParams("/some/path", 120);
    expect(exp).toBeGreaterThanOrEqual(before + 120);
    expect(exp).toBeLessThanOrEqual(before + 121);
  });

  it("clamps TTL to 1 hour to prevent over-long URL lifetimes", () => {
    const before = Math.floor(Date.now() / 1000);
    const { exp } = createSignedObjectParams("/some/path", 365 * 24 * 60 * 60);
    expect(exp).toBeLessThanOrEqual(before + 60 * 60 + 1);
  });

  it("clamps non-positive TTL up to at least 1 second", () => {
    const before = Math.floor(Date.now() / 1000);
    const { exp } = createSignedObjectParams("/some/path", -100);
    expect(exp).toBeGreaterThanOrEqual(before + 1);
  });
});

describe("verifySignedObjectParams", () => {
  it("accepts a freshly created signature", () => {
    const objectPath = "/local-objects/docs/photo.jpg";
    const { exp, sig } = createSignedObjectParams(objectPath, 300);
    expect(verifySignedObjectParams(objectPath, String(exp), sig)).toBe(true);
  });

  it("rejects an expired signature", () => {
    const objectPath = "/local-objects/docs/photo.jpg";
    const { sig } = createSignedObjectParams(objectPath, 300);
    const pastExp = Math.floor(Date.now() / 1000) - 1;
    expect(verifySignedObjectParams(objectPath, String(pastExp), sig)).toBe(false);
  });

  it("rejects a tampered path", () => {
    const { exp, sig } = createSignedObjectParams("/local-objects/docs/photo.jpg", 300);
    expect(verifySignedObjectParams("/local-objects/docs/other.jpg", String(exp), sig)).toBe(false);
  });

  it("rejects a wrong signature", () => {
    const objectPath = "/local-objects/docs/photo.jpg";
    const { exp } = createSignedObjectParams(objectPath, 300);
    const badSig = "a".repeat(64);
    expect(verifySignedObjectParams(objectPath, String(exp), badSig)).toBe(false);
  });

  it("rejects non-hex sig", () => {
    const objectPath = "/local-objects/docs/photo.jpg";
    const { exp } = createSignedObjectParams(objectPath, 300);
    expect(verifySignedObjectParams(objectPath, String(exp), "not-valid!!")).toBe(false);
  });

  it("rejects missing params", () => {
    expect(verifySignedObjectParams("/path", undefined, undefined)).toBe(false);
    expect(verifySignedObjectParams("/path", "123", undefined)).toBe(false);
  });
});
