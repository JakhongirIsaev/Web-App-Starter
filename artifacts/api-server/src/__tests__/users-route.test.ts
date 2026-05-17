import {
  describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach,
} from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

/**
 * PR-T1 baseline for routes/users.ts. Pins two contracts so PR-E1 (central
 * error envelopes) and PR-R1 (mini-app split) cannot silently regress
 * them:
 *   1. Every protected endpoint returns 401 { error: "Unauthorized" } when
 *      no Bearer token is supplied AND DEMO_MODE is not enabled. The
 *      capital-U envelope comes from guestAuth in middleware/auth.ts and
 *      is the actual current shape (NOT the lowercase "unauthorized" used
 *      by /api/auth/me, which lives in routes/auth.ts).
 *   2. POST /api/users with an empty body hits CreateUserBody.safeParse
 *      and returns 400 with an `error` string in the envelope.
 */

vi.mock("../lib/session-store", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionsForUser: vi.fn(),
  // findSessionUserId is fixed at null so any bearer token fails the
  // session lookup -- the /me-style fallthrough then either returns 401
  // (DEMO_MODE off) or falls into the guest-user DB query (DEMO_MODE on).
  findSessionUserId: vi.fn(async () => null),
}));

vi.mock("@workspace/db", async () => {
  const actual: any = await vi.importActual("@workspace/db");
  // The chain proxy doubles as a drizzle query builder AND a thenable.
  // Awaiting it resolves to whatever `result` was passed at chain
  // construction time, which is all guestAuth/requireRole need: a single
  // FAKE_SUPERADMIN row so the auth chain passes and the route handler
  // can reach its own safeParse logic. None of the 400 tests below
  // exercise the DB beyond that.
  const FAKE_SUPERADMIN = {
    id: 1,
    telegramId: "test-superadmin",
    name: "Test Admin",
    role: "superadmin",
    branchId: null,
    isActive: true,
  };

  function chain(result: any): any {
    const obj: any = {
      from: () => obj,
      where: () => obj,
      leftJoin: () => obj,
      innerJoin: () => obj,
      orderBy: () => obj,
      limit: () => obj,
      offset: () => obj,
      groupBy: () => obj,
      values: () => obj,
      set: () => obj,
      onConflictDoNothing: () => obj,
      onConflictDoUpdate: () => obj,
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
  const { default: usersRouter } = await import("../routes/users");
  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter);
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

describe("/api/users 401 contract (guestAuth without DEMO_MODE)", () => {
  beforeEach(() => { delete process.env.DEMO_MODE; });

  const cases: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET",    path: "/users" },
    { method: "POST",   path: "/users", body: {} },
    { method: "GET",    path: "/users/1" },
    { method: "PUT",    path: "/users/1", body: {} },
    { method: "DELETE", path: "/users/1" },
    { method: "POST",   path: "/users/1/deactivate" },
    { method: "POST",   path: "/users/1/activate" },
    { method: "POST",   path: "/users/1/revoke-sessions" },
    { method: "GET",    path: "/users/import-template" },
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
      const body = (await res.json()) as { error: string };
      expect(body).toEqual({ error: "Unauthorized" });
    });
  }
});

describe("/api/users 400 contract (CreateUserBody safeParse)", () => {
  // DEMO_MODE=true makes guestAuth fall through to the highest-privilege
  // DB user (FAKE_SUPERADMIN from the mock), which lets the request reach
  // the route handler and hit the safeParse branch.
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => { delete process.env.DEMO_MODE; });

  it("POST /users with an empty body returns 400 with an error string envelope", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    // Pin only the top-level shape (envelope contains a string `error`);
    // PR-E1 may rewrite the i18n text or the `details` field but the
    // top-level error-string contract is what API clients depend on.
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("POST /users with a body missing required role returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telegramId: "123", name: "X", password: "secret" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });
});
