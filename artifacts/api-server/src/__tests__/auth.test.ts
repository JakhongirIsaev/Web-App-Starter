import { describe, it, expect } from "vitest";
import { extractAuthToken, extractBearerToken } from "../middleware/auth";

describe("extractBearerToken", () => {
  it("extracts token from a well-formed Authorization header", () => {
    const req = { headers: { authorization: "Bearer abc123" } } as any;
    expect(extractBearerToken(req)).toBe("abc123");
  });

  it("is case-insensitive on the scheme", () => {
    const req = { headers: { authorization: "bearer abc123" } } as any;
    expect(extractBearerToken(req)).toBe("abc123");
  });

  it("returns undefined when header missing", () => {
    const req = { headers: {} } as any;
    expect(extractBearerToken(req)).toBeUndefined();
  });

  it("returns undefined for non-Bearer schemes", () => {
    const req = { headers: { authorization: "Basic dXNlcjpwYXNz" } } as any;
    expect(extractBearerToken(req)).toBeUndefined();
  });

  it("ignores token in query string", () => {
    const req = { headers: {}, method: "GET", query: { token: "should-be-ignored" } } as any;
    expect(extractBearerToken(req)).toBeUndefined();
  });

  it("returns undefined when Bearer is empty", () => {
    const req = { headers: { authorization: "Bearer  " } } as any;
    expect(extractBearerToken(req)).toBeUndefined();
  });
});

describe("extractAuthToken", () => {
  it("returns Bearer token from Authorization header", () => {
    const req = {
      headers: { authorization: "Bearer header-token" },
      query: {},
    } as any;
    expect(extractAuthToken(req)).toBe("header-token");
  });

  it("does not accept token from query string (session tokens must not appear in URLs)", () => {
    const req = { headers: {}, method: "GET", query: { token: "query-token" } } as any;
    expect(extractAuthToken(req)).toBeUndefined();
  });
});

describe("requireRole pure role check", () => {
  const checkRole = (userRole: string | undefined, allowedRoles: string[]) => {
    if (!userRole || !allowedRoles.includes(userRole)) return false;
    return true;
  };

  it("allows when user has required role", () => {
    expect(checkRole("superadmin", ["superadmin", "head_office_admin"])).toBe(true);
  });

  it("rejects when user lacks required role", () => {
    expect(checkRole("hunter", ["superadmin"])).toBe(false);
  });

  it("rejects when no user", () => {
    expect(checkRole(undefined, ["superadmin"])).toBe(false);
  });
});
