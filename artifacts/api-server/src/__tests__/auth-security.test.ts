import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * SECURITY (PR-S1): The former /auth/me handler returned the highest-privilege
 * active user when no bearer token was provided, effectively handing out a
 * superadmin identity to any anonymous caller. The new handler MUST fail
 * closed and return 401 instead. This test mounts the real auth router with
 * the DB + session-store dependencies stubbed and asserts the 401 contract.
 */

// Stub the session store -- token lookups always miss in these tests.
vi.mock("../lib/session-store", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionsForUser: vi.fn(),
  findSessionUserId: vi.fn(async () => null),
}));

// Stub the bot send so password-reset flows do not try to call Telegram.
vi.mock("../bot", () => ({
  sendMessage: vi.fn(async () => undefined),
}));

// Stub the DB. Any call into a query builder returns an empty array so
// "user not found" is the consistent fallthrough behaviour.
vi.mock("@workspace/db", async () => {
  const actual: any = await vi.importActual("@workspace/db");
  const emptyChain: any = new Proxy(function () {}, {
    get: () => emptyChain,
    apply: () => emptyChain,
  });
  return {
    ...actual,
    db: {
      select: () => emptyChain,
      insert: () => emptyChain,
      update: () => emptyChain,
      delete: () => emptyChain,
      execute: vi.fn(async () => ({ rows: [] })),
    },
  };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: authRouter } = await import("../routes/auth");
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
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

describe("GET /api/auth/me security", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("returns 401 when Authorization header is present but does not use Bearer scheme", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when a token is present only in the query string (session tokens must not appear in URLs)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me?token=any-string`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unknown/expired Bearer token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: "Bearer unknown-or-expired" },
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/guest security", () => {
  it("is removed and returns 404 (no anonymous super-admin handout)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/guest`);
    expect(res.status).toBe(404);
  });
});
