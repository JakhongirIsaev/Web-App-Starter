import {
  describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * PR-T1 baseline for routes/branches.ts. Pins the 401 contract on every
 * guestAuth-gated branches endpoint and the 400 contract on POST
 * /api/branches (CreateBranchBody.safeParse). Note that /api/branches/:id
 * uses z.coerce.number() which silently accepts NaN, so the only
 * reliable safeParse 400 trigger is an invalid POST body.
 */

vi.mock("../lib/session-store", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionsForUser: vi.fn(),
  findSessionUserId: vi.fn(async () => null),
}));

vi.mock("@workspace/db", async () => {
  const actual: any = await vi.importActual("@workspace/db");
  const FAKE_SUPERADMIN = {
    id: 1, telegramId: "test", name: "Test", role: "superadmin",
    branchId: null, isActive: true,
  };
  function chain(result: any): any {
    const obj: any = {
      from: () => obj, where: () => obj, leftJoin: () => obj,
      innerJoin: () => obj, orderBy: () => obj, limit: () => obj,
      offset: () => obj, groupBy: () => obj, values: () => obj,
      set: () => obj,
      returning: () => Promise.resolve(result),
      then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    };
    return obj;
  }
  return {
    ...actual,
    db: {
      select: () => chain([FAKE_SUPERADMIN]),
      selectDistinct: () => chain([]),
      insert: () => chain([FAKE_SUPERADMIN]),
      update: () => chain([FAKE_SUPERADMIN]),
      delete: () => chain([]),
      transaction: async (fn: any) => fn({
        insert: () => chain([FAKE_SUPERADMIN]),
        update: () => chain([FAKE_SUPERADMIN]),
        delete: () => chain([]),
      }),
      execute: vi.fn(async () => ({ rows: [] })),
    },
  };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: branchesRouter } = await import("../routes/branches");
  const app = express();
  app.use(express.json());
  app.use("/api", branchesRouter);
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

describe("/api/branches 401 contract (guestAuth without DEMO_MODE)", () => {
  beforeEach(() => { delete process.env.DEMO_MODE; });

  const cases: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET",    path: "/branches" },
    { method: "POST",   path: "/branches", body: {} },
    { method: "GET",    path: "/branches/1" },
    { method: "PUT",    path: "/branches/1", body: {} },
    { method: "DELETE", path: "/branches/1" },
  ];

  for (const c of cases) {
    it(`${c.method} ${c.path} -> 401 { error: "Unauthorized" } when no Bearer header`, async () => {
      const init: RequestInit = { method: c.method };
      if (c.body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(c.body);
      }
      const res = await fetch(`${baseUrl}/api${c.path}`, init);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  }
});

describe("/api/branches 400 contract (CreateBranchBody safeParse)", () => {
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => { delete process.env.DEMO_MODE; });

  it("POST /branches with an empty body returns 400 with an error string envelope", async () => {
    const res = await fetch(`${baseUrl}/api/branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("POST /branches with only `name` (missing `city`) returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Headquarters" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });
});
