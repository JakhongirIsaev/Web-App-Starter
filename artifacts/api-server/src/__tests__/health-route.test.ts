import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * PR-T1 baseline. health.ts is the only public router in this batch -- it
 * mounts GET /api/healthz with no auth and returns the schema-parsed
 * { status: "ok" } envelope. PR-E1 (error envelopes) should not touch
 * the 200 path; this test pins it in case the central error helpers are
 * accidentally wired into the success path too.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: healthRouter } = await import("../routes/health");
  const app = express();
  app.use(express.json());
  app.use("/api", healthRouter);
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("GET /api/healthz", () => {
  it("returns 200 with { status: \"ok\" } (public endpoint, no auth needed)", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns the same envelope even when a Bearer header is sent (header is ignored on public endpoints)", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`, {
      headers: { authorization: "Bearer anything" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns JSON content-type so clients can parse the body without sniffing", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/i);
  });
});
