import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  // vitest 4 stricter `new` semantics: hand-rolled class instead of
  // vi.fn().mockImplementation. The fake S3Client returned here is enough
  // for the call sites in storage/r2-client.ts (constructor + .send()).
  class FakeS3Client {
    send = send;
  }
  class FakeCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: FakeS3Client,
    PutObjectCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    DeleteObjectCommand: FakeCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/key"),
}));

beforeEach(() => {
  vi.resetModules();
  process.env.R2_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "bucket";
  process.env.R2_PUBLIC_BASE_URL = "https://r2.example";
});

describe("R2Storage", () => {
  it("uploads with content type and returns public URL", async () => {
    const { R2Storage } = await import("../storage/r2-client");
    const r2 = new R2Storage();
    const url = await r2.upload({
      key: "clients/1/photo.jpg",
      body: Buffer.from("hi"),
      contentType: "image/jpeg",
    });
    expect(url).toBe("https://r2.example/clients/1/photo.jpg");
  });

  it("returns a signed URL with given expiry", async () => {
    const { R2Storage } = await import("../storage/r2-client");
    const r2 = new R2Storage();
    const url = await r2.signedUrl("clients/1/private.pdf", 900);
    expect(url).toBe("https://signed.example/key");
  });

  it("throws clear error if R2 env vars are missing", async () => {
    delete process.env.R2_ACCOUNT_ID;
    const { R2Storage } = await import("../storage/r2-client");
    expect(() => new R2Storage()).toThrow(/R2_ACCOUNT_ID/);
  });

  it("singleton getR2 returns same instance", async () => {
    const { getR2 } = await import("../storage/r2-client");
    const a = getR2();
    const b = getR2();
    expect(a).toBe(b);
  });
});
