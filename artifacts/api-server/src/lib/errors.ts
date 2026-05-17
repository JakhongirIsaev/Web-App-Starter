// artifacts/api-server/src/lib/errors.ts
//
// Centralised error envelope helpers.
//
// Wire shape: `{ error: string, code?: string, details?: unknown }`.
//
// For callers that previously emitted a bare `{ error }` envelope we keep it
// bare — `code` / `details` are only attached when explicitly supplied. That
// preserves byte-exact responses for the existing tests and HTTP clients.
//
// Every helper sends the response and returns `void`, matching the Express 5
// route-handler convention used elsewhere in this server. Callers that need to
// exit the handler should follow the helper call with a bare `return;` as they
// already do for the inline `res.status(...).json(...)` form.

import type { Response } from "express";

/** Bilingual default for invalid-body errors used throughout the codebase. */
export const BILINGUAL_INVALID_BODY = "Некорректные данные / Noto'g'ri ma'lumot";

/** Bilingual default for not-found errors used throughout the codebase. */
export const BILINGUAL_NOT_FOUND = "Не найдено / Topilmadi";

type ErrorEnvelope = {
  error: string;
  code?: string;
  details?: unknown;
};

type ErrorOpts = {
  code?: string;
  details?: unknown;
};

function sendError(
  res: Response,
  status: number,
  message: string,
  opts?: ErrorOpts,
): void {
  const body: ErrorEnvelope = { error: message };
  if (opts?.code !== undefined) body.code = opts.code;
  if (opts?.details !== undefined) body.details = opts.details;
  res.status(status).json(body);
}

/** HTTP 400 — invalid input from the client. */
export function badRequest(
  res: Response,
  message: string,
  opts?: ErrorOpts,
): void {
  sendError(res, 400, message, opts);
}

/** HTTP 401 — missing or invalid credentials. Defaults to `"unauthorized"`. */
export function unauthorized(res: Response, message: string = "unauthorized"): void {
  sendError(res, 401, message);
}

/** HTTP 403 — authenticated but not permitted. Defaults to `"forbidden"`. */
export function forbidden(res: Response, message: string = "forbidden"): void {
  sendError(res, 403, message);
}

/** HTTP 404 — resource missing. Defaults to `"not_found"`. */
export function notFound(res: Response, message: string = "not_found"): void {
  sendError(res, 404, message);
}

/** HTTP 409 — state conflict (e.g. duplicate, status-transition rejection). */
export function conflict(
  res: Response,
  message: string,
  opts?: { code?: string },
): void {
  sendError(res, 409, message, opts);
}

/** HTTP 429 — rate-limit / quota exhaustion. */
export function tooManyRequests(res: Response, message: string): void {
  sendError(res, 429, message);
}

/** HTTP 500 — server-side failure. Defaults to `"internal_server_error"`. */
export function internalServerError(
  res: Response,
  message: string = "internal_server_error",
): void {
  sendError(res, 500, message);
}
