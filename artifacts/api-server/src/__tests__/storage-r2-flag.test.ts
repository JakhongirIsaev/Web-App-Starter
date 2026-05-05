import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Smoke test for the STORAGE_BACKEND env switch on the storage router.
// Default must stay "local-fs" so deploys without R2 credentials don't break.
describe("STORAGE_BACKEND env switch", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.STORAGE_BACKEND;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = original;
  });

  it("defaults to local-fs when env var is unset", async () => {
    delete process.env.STORAGE_BACKEND;
    const { getStorageBackend } = await import("../routes/storage");
    expect(getStorageBackend()).toBe("local-fs");
  });

  it("returns r2 when STORAGE_BACKEND=r2", async () => {
    process.env.STORAGE_BACKEND = "r2";
    const { getStorageBackend } = await import("../routes/storage");
    expect(getStorageBackend()).toBe("r2");
  });

  it("falls back to local-fs for unknown values", async () => {
    process.env.STORAGE_BACKEND = "s3";
    const { getStorageBackend } = await import("../routes/storage");
    expect(getStorageBackend()).toBe("local-fs");
  });
});
