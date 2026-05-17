import {
  describe, it, expect, vi, beforeAll, afterAll, beforeEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * PR-T1 baseline for routes/dashboard.ts. Pins the 401 contract on every
 * guestAuth-gated dashboard endpoint so PR-E1's error-envelope sweep
 * cannot silently change the shape. NOTE: there is no public safeParse
 * 400 branch in dashboard.ts -- every parsed.success result is consumed
 * with a silent fallback (`q = parsed.success ? parsed.data : {}` or
 * `params.success && params.data.limit ? ... : 20`). The 400 contract
 * test is therefore an it.skip() with a justification rather than a
 * synthetic case that would lock in unintended behaviour.
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
      insert: () => chain([]),
      update: () => chain([]),
      delete: () => chain([]),
      transaction: async (fn: any) => fn({}),
      execute: vi.fn(async () => ({ rows: [] })),
    },
  };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: dashboardRouter } = await import("../routes/dashboard");
  const app = express();
  app.use(express.json());
  app.use("/api", dashboardRouter);
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

describe("/api/dashboard 401 contract (guestAuth without DEMO_MODE)", () => {
  beforeEach(() => { delete process.env.DEMO_MODE; });

  const paths = [
    "/dashboard/summary",
    "/dashboard/activity",
    "/dashboard/branch-stats",
    "/dashboard/client-status",
    "/dashboard/rejection-reasons",
    "/dashboard/tasks",
    "/admin/activity-log",
    "/admin/activity-log/types",
  ];

  for (const p of paths) {
    it(`GET ${p} -> 401 { error: "Unauthorized" } when no Bearer header`, async () => {
      const res = await fetch(`${baseUrl}/api${p}`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  }
});

describe("/api/dashboard 400 contract", () => {
  // No safeParse path in dashboard.ts returns 400 -- every safeParse is
  // followed by a silent fallback (`if (parsed.success) ...` or
  // `parsed.success ? parsed.data : {}`). Triggering a synthetic 400
  // would require route changes outside Worker T1's scope.
  it.skip("dashboard.ts has no safeParse-driven 400 branch to pin", () => {
    /* intentionally skipped: see describe-block comment */
  });
});
