import {
  describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * PR-T1 baseline for routes/articles.ts. Pins the 401 contract on every
 * guestAuth-gated articles endpoint and the 400 contract on POST
 * /api/articles (CreateArticleBody.safeParse).
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
  const { default: articlesRouter } = await import("../routes/articles");
  const app = express();
  app.use(express.json());
  app.use("/api", articlesRouter);
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

describe("/api/articles 401 contract (guestAuth without DEMO_MODE)", () => {
  beforeEach(() => { delete process.env.DEMO_MODE; });

  const cases: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET",    path: "/articles" },
    { method: "POST",   path: "/articles", body: {} },
    { method: "GET",    path: "/articles/1" },
    { method: "PUT",    path: "/articles/1", body: {} },
    { method: "DELETE", path: "/articles/1" },
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

describe("/api/articles 400 contract (CreateArticleBody safeParse)", () => {
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => { delete process.env.DEMO_MODE; });

  it("POST /articles with an empty body returns 400 with an error string envelope", async () => {
    const res = await fetch(`${baseUrl}/api/articles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("POST /articles with only `title` (missing `content`) returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/articles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Hello" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });
});
