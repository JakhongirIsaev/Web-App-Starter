// artifacts/api-server/src/__tests__/errors.test.ts
//
// Unit tests for the centralised error envelope helpers in src/lib/errors.ts.
// These tests pin the wire shape down so future refactors of lib/errors.ts
// cannot silently change the JSON body that clients depend on.

import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import {
  BILINGUAL_INVALID_BODY,
  BILINGUAL_NOT_FOUND,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
  internalServerError,
} from "../lib/errors";

type FakeRes = Pick<Response, "status" | "json"> & {
  __status?: number;
  __body?: unknown;
};

function makeRes(): FakeRes {
  const res = {} as FakeRes;
  res.status = vi.fn((code: number) => {
    res.__status = code;
    return res as unknown as Response;
  }) as unknown as Response["status"];
  res.json = vi.fn((body: unknown) => {
    res.__body = body;
    return res as unknown as Response;
  }) as unknown as Response["json"];
  return res;
}

describe("lib/errors helpers", () => {
  describe("badRequest", () => {
    it("sends 400 with a bare {error} envelope", () => {
      const res = makeRes();
      const ret = badRequest(res as unknown as Response, "invalid_body");
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(400);
      expect(res.__body).toEqual({ error: "invalid_body" });
      expect(res.status).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledTimes(1);
    });

    it("round-trips the optional code field", () => {
      const res = makeRes();
      badRequest(res as unknown as Response, "bad", { code: "BAD_CODE" });
      expect(res.__body).toEqual({ error: "bad", code: "BAD_CODE" });
    });

    it("round-trips the optional details field", () => {
      const res = makeRes();
      const details = { fieldErrors: { name: ["required"] }, formErrors: [] };
      badRequest(res as unknown as Response, BILINGUAL_INVALID_BODY, { details });
      expect(res.__body).toEqual({
        error: BILINGUAL_INVALID_BODY,
        details,
      });
    });

    it("includes both code and details when both supplied", () => {
      const res = makeRes();
      badRequest(res as unknown as Response, "x", { code: "C", details: { a: 1 } });
      expect(res.__body).toEqual({ error: "x", code: "C", details: { a: 1 } });
    });

    it("omits code/details when the keys are absent", () => {
      const res = makeRes();
      badRequest(res as unknown as Response, "x", {});
      expect(res.__body).toEqual({ error: "x" });
      const keys = Object.keys(res.__body as object);
      expect(keys).toEqual(["error"]);
    });

    it("does not insert a code field when only details is supplied", () => {
      const res = makeRes();
      badRequest(res as unknown as Response, "x", { details: { a: 1 } });
      const keys = Object.keys(res.__body as object);
      expect(keys).toEqual(["error", "details"]);
    });
  });

  describe("unauthorized", () => {
    it("sends 401 with the default message", () => {
      const res = makeRes();
      const ret = unauthorized(res as unknown as Response);
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(401);
      expect(res.__body).toEqual({ error: "unauthorized" });
    });

    it("accepts a custom bilingual message", () => {
      const res = makeRes();
      unauthorized(res as unknown as Response, "Ruxsat yo'q");
      expect(res.__status).toBe(401);
      expect(res.__body).toEqual({ error: "Ruxsat yo'q" });
    });
  });

  describe("forbidden", () => {
    it("sends 403 with the default message", () => {
      const res = makeRes();
      const ret = forbidden(res as unknown as Response);
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(403);
      expect(res.__body).toEqual({ error: "forbidden" });
    });

    it("accepts a custom message", () => {
      const res = makeRes();
      forbidden(res as unknown as Response, "Ruxsat yo'q");
      expect(res.__body).toEqual({ error: "Ruxsat yo'q" });
    });
  });

  describe("notFound", () => {
    it("sends 404 with the default message", () => {
      const res = makeRes();
      const ret = notFound(res as unknown as Response);
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(404);
      expect(res.__body).toEqual({ error: "not_found" });
    });

    it("accepts the bilingual not-found message", () => {
      const res = makeRes();
      notFound(res as unknown as Response, BILINGUAL_NOT_FOUND);
      expect(res.__body).toEqual({ error: BILINGUAL_NOT_FOUND });
    });
  });

  describe("conflict", () => {
    it("sends 409 with a bare {error} envelope", () => {
      const res = makeRes();
      const ret = conflict(res as unknown as Response, "already_exists");
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(409);
      expect(res.__body).toEqual({ error: "already_exists" });
    });

    it("round-trips the optional code field", () => {
      const res = makeRes();
      conflict(res as unknown as Response, "transition_rejected", { code: "STATUS_LOCKED" });
      expect(res.__body).toEqual({ error: "transition_rejected", code: "STATUS_LOCKED" });
    });
  });

  describe("tooManyRequests", () => {
    it("sends 429 with the supplied message", () => {
      const res = makeRes();
      const ret = tooManyRequests(res as unknown as Response, "??????? ????? ????????");
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(429);
      expect(res.__body).toEqual({ error: "??????? ????? ????????" });
    });
  });

  describe("internalServerError", () => {
    it("sends 500 with the default message", () => {
      const res = makeRes();
      const ret = internalServerError(res as unknown as Response);
      expect(ret).toBeUndefined();
      expect(res.__status).toBe(500);
      expect(res.__body).toEqual({ error: "internal_server_error" });
    });

    it("accepts a custom bilingual message", () => {
      const res = makeRes();
      internalServerError(res as unknown as Response, "Tiklash kodini yuborib bo'lmadi");
      expect(res.__body).toEqual({ error: "Tiklash kodini yuborib bo'lmadi" });
    });
  });

  describe("bilingual constants", () => {
    it("BILINGUAL_INVALID_BODY matches the bilingual phrase used by routes", () => {
      expect(BILINGUAL_INVALID_BODY).toBe("Некорректные данные / Noto'g'ri ma'lumot");
    });
    it("BILINGUAL_NOT_FOUND matches the bilingual phrase used by routes", () => {
      expect(BILINGUAL_NOT_FOUND).toBe("Не найдено / Topilmadi");
    });
  });

  describe("return type", () => {
    it("all helpers return undefined (void) so callers can `helper(); return;`", () => {
      const res = makeRes();
      const results: Array<unknown> = [
        badRequest(res as unknown as Response, "a"),
        unauthorized(res as unknown as Response),
        forbidden(res as unknown as Response),
        notFound(res as unknown as Response),
        conflict(res as unknown as Response, "a"),
        tooManyRequests(res as unknown as Response, "a"),
        internalServerError(res as unknown as Response),
      ];
      for (const r of results) {
        expect(r).toBeUndefined();
      }
    });
  });
});
