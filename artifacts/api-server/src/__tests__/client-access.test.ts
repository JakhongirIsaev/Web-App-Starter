import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { hasClientRoleAccess, __testing } from "../lib/client-access";

const { parsePositiveInt, makeParamGuard } = __testing;

type User = { id: number; role: string; branchId: number | null };

describe("hasClientRoleAccess — role matrix", () => {
  const client = { assignedToId: 7, branchId: 3 };

  it("superadmin sees every client regardless of branch/assignment", () => {
    const u: User = { id: 999, role: "superadmin", branchId: null };
    expect(hasClientRoleAccess(client, u)).toBe(true);
  });

  it("head_office_admin sees every client regardless of branch/assignment", () => {
    const u: User = { id: 999, role: "head_office_admin", branchId: 42 };
    expect(hasClientRoleAccess(client, u)).toBe(true);
  });

  it("branch_head sees clients in their branch", () => {
    const u: User = { id: 999, role: "branch_head", branchId: 3 };
    expect(hasClientRoleAccess(client, u)).toBe(true);
  });

  it("branch_head does NOT see clients in other branches", () => {
    const u: User = { id: 999, role: "branch_head", branchId: 4 };
    expect(hasClientRoleAccess(client, u)).toBe(false);
  });

  it("branch_head with no branchId falls back to assignedToId match (only sees own clients)", () => {
    const assigned: User = { id: 7, role: "branch_head", branchId: null };
    expect(hasClientRoleAccess(client, assigned)).toBe(true);
    const other: User = { id: 8, role: "branch_head", branchId: null };
    expect(hasClientRoleAccess(client, other)).toBe(false);
  });

  it("hunter (default role) sees only assigned clients", () => {
    const assigned: User = { id: 7, role: "hunter", branchId: 3 };
    expect(hasClientRoleAccess(client, assigned)).toBe(true);
    const otherAssignee: User = { id: 8, role: "hunter", branchId: 3 };
    expect(hasClientRoleAccess(client, otherAssignee)).toBe(false);
  });

  it("unassigned client (assignedToId=null) is invisible to non-admin/branch-head", () => {
    const unassigned = { assignedToId: null, branchId: 3 };
    const u: User = { id: 7, role: "hunter", branchId: 3 };
    expect(hasClientRoleAccess(unassigned, u)).toBe(false);
  });

  it("unknown role falls through to assignment check (no privileged shortcut)", () => {
    const u: User = { id: 7, role: "somebody_made_up_a_role", branchId: 3 };
    expect(hasClientRoleAccess(client, u)).toBe(true);
    const other: User = { id: 8, role: "somebody_made_up_a_role", branchId: 3 };
    expect(hasClientRoleAccess(client, other)).toBe(false);
  });
});

describe("parsePositiveInt", () => {
  it("accepts positive integers as numbers", () => {
    expect(parsePositiveInt(1)).toBe(1);
    expect(parsePositiveInt(42)).toBe(42);
  });

  it("accepts positive integers as numeric strings", () => {
    expect(parsePositiveInt("1")).toBe(1);
    expect(parsePositiveInt("42")).toBe(42);
  });

  it("rejects zero", () => {
    expect(parsePositiveInt(0)).toBeNull();
    expect(parsePositiveInt("0")).toBeNull();
  });

  it("rejects negative values", () => {
    expect(parsePositiveInt(-1)).toBeNull();
    expect(parsePositiveInt("-5")).toBeNull();
  });

  it("rejects non-integer numbers", () => {
    expect(parsePositiveInt(1.5)).toBeNull();
    expect(parsePositiveInt("3.14")).toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt("1abc")).toBeNull();
    expect(parsePositiveInt("")).toBeNull();
  });

  it("rejects undefined / null / objects", () => {
    expect(parsePositiveInt(undefined)).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
    expect(parsePositiveInt({})).toBeNull();
    expect(parsePositiveInt([])).toBeNull();
  });

  it("rejects NaN / Infinity", () => {
    expect(parsePositiveInt(NaN)).toBeNull();
    expect(parsePositiveInt(Infinity)).toBeNull();
    expect(parsePositiveInt(-Infinity)).toBeNull();
  });
});

function mockRes() {
  const json = vi.fn();
  const status = vi.fn().mockImplementation(() => ({ json }));
  return { status, json, res: { status, json } as unknown as Response };
}

describe("makeParamGuard — middleware deny paths", () => {
  const resolver = async (id: number) => ({ clientId: id });
  const guard = makeParamGuard(resolver, "Resource not found");

  it("400 on non-integer id", async () => {
    const { res, status, json } = mockRes();
    const req = { params: { id: "abc" }, user: undefined } as unknown as Request;
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: "Некорректный идентификатор / Noto'g'ri identifikator" });
    expect(next).not.toHaveBeenCalled();
  });

  it("400 on zero id", async () => {
    const { res, status } = mockRes();
    const req = { params: { id: "0" } } as unknown as Request;
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("404 when resolver returns null (resource missing)", async () => {
    const missing = makeParamGuard(async () => null, "Resource not found");
    const { res, status, json } = mockRes();
    const req = { params: { id: "42" } } as unknown as Request;
    const next = vi.fn() as NextFunction;
    await missing(req, res, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "Resource not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401 when req.user is missing", async () => {
    const { res, status, json } = mockRes();
    const req = { params: { id: "42" }, user: undefined } as unknown as Request;
    const next = vi.fn() as NextFunction;
    await guard(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Требуется авторизация / Avtorizatsiya kerak" });
    expect(next).not.toHaveBeenCalled();
  });

  it("uses custom paramName in the 400 message", async () => {
    const withCustomParam = makeParamGuard(resolver, "Resource not found", "docId");
    const { res, json } = mockRes();
    const req = { params: { docId: "nope" } } as unknown as Request;
    const next = vi.fn() as NextFunction;
    await withCustomParam(req, res, next);
    expect(json).toHaveBeenCalledWith({ error: "Некорректный идентификатор / Noto'g'ri identifikator" });
  });
});
