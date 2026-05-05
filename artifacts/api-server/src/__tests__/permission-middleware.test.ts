import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requirePermission } from "../middleware/auth";

function makeReq(role?: string): Request {
  return (role ? { user: { id: 1, role } } : {}) as unknown as Request;
}
function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("requirePermission", () => {
  it("calls next() when role has permission", () => {
    const next = vi.fn();
    const mw = requirePermission("client.read.all");
    mw(makeReq("superadmin"), makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 when role lacks permission", () => {
    const next = vi.fn();
    const res = makeRes();
    const mw = requirePermission("client.delete");
    mw(makeReq("editor"), res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no user attached to req", () => {
    const next = vi.fn();
    const res = makeRes();
    const mw = requirePermission("client.read.own");
    mw(makeReq(), res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
