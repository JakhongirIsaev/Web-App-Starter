import { describe, it, expect } from "vitest";
import { validateReassignmentForUser } from "../lib/reassignment";
import type { User } from "@workspace/db";

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  telegramId: "100000001",
  name: "Test",
  phone: null,
  role: "hunter",
  branchId: 1,
  passwordHash: "x",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("validateReassignmentForUser", () => {
  it("accepts active hunter in same branch", () => {
    const result = validateReassignmentForUser(makeUser({ role: "hunter", branchId: 5 }), 5);
    expect(result.ok).toBe(true);
  });

  it("accepts active branch_head in same branch", () => {
    const result = validateReassignmentForUser(makeUser({ role: "branch_head", branchId: 5 }), 5);
    expect(result.ok).toBe(true);
  });

  it("rejects when user is missing", () => {
    const result = validateReassignmentForUser(undefined, 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("user_not_found");
  });

  it("rejects deactivated user", () => {
    const result = validateReassignmentForUser(makeUser({ isActive: false }), 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("user_inactive");
  });

  it("rejects superadmin (not assignable)", () => {
    const result = validateReassignmentForUser(makeUser({ role: "superadmin" }), 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("user_role_disallowed");
  });

  it("rejects head_office_admin (not assignable)", () => {
    const result = validateReassignmentForUser(makeUser({ role: "head_office_admin" }), 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("user_role_disallowed");
  });

  it("rejects editor (not assignable)", () => {
    const result = validateReassignmentForUser(makeUser({ role: "editor" }), 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("user_role_disallowed");
  });

  it("rejects branch mismatch", () => {
    const result = validateReassignmentForUser(makeUser({ branchId: 2 }), 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("branch_mismatch");
  });

  it("allows when client has no branch (legacy data)", () => {
    const result = validateReassignmentForUser(makeUser({ branchId: 7 }), null);
    expect(result.ok).toBe(true);
  });

  it("allows when target user has no branch (head office)", () => {
    // Edge case kept as-is: a hunter without branchId is treated as compatible.
    const result = validateReassignmentForUser(makeUser({ branchId: null }), 5);
    expect(result.ok).toBe(true);
  });

  it("returns a localized message bilingual", () => {
    const result = validateReassignmentForUser(makeUser({ isActive: false }), 5);
    expect(result.message).toMatch(/Foydalanuvchi/);
    expect(result.message).toMatch(/Пользователь/);
  });
});
