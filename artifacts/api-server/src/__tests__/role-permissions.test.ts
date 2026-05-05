import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, hasPermission } from "../rbac/role-permissions";

describe("ROLE_PERMISSIONS", () => {
  it("superadmin has every permission", () => {
    expect(hasPermission("superadmin", "client.delete")).toBe(true);
    expect(hasPermission("superadmin", "policy_params.update")).toBe(true);
  });

  it("hunter cannot manage users", () => {
    expect(hasPermission("hunter", "user.delete")).toBe(false);
  });

  it("branch_head sees only their branch", () => {
    expect(hasPermission("branch_head", "client.read.branch")).toBe(true);
    expect(hasPermission("branch_head", "client.read.all")).toBe(false);
  });

  it("editor cannot edit policy params", () => {
    expect(hasPermission("editor", "policy_params.update")).toBe(false);
  });
});
