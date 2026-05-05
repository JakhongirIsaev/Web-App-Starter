import i18n from "@/i18n";
import { enqueue } from "./offline-queue";

const API_BASE = "/api";
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${normalizedPath}` : normalizedPath;
}

function getToken(): string | null {
  return localStorage.getItem("miniapp_auth_token");
}

export function setToken(token: string) {
  localStorage.setItem("miniapp_auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("miniapp_auth_token");
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildApiUrl(`${API_BASE}${path}`), {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "" }));
      throw new Error(err.error || i18n.t("common.requestFailed"));
    }
    return res.json();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(i18n.t("common.requestFailed"));
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestBlob(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildApiUrl(`${API_BASE}${path}`), {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(i18n.t("common.requestFailed"));
    }
    return res.blob();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(i18n.t("common.requestFailed"));
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getSignedImageUrl(objectPath: string): Promise<string> {
  const data = (await api.post("/storage/signed-url", { path: objectPath })) as
    | { exp: number; sig: string }            // legacy local-FS shape
    | { url: string; expiresIn: number };     // new R2 shape

  // R2 backend returns a fully-qualified presigned URL the browser can hit
  // directly, so just hand it back. The local-FS shape needs the legacy
  // /storage/file?path=...&exp=...&sig=... query-signed URL build.
  if ("url" in data) {
    return data.url;
  }

  return buildApiUrl(
    `${API_BASE}/storage/file?path=${encodeURIComponent(objectPath)}&exp=${data.exp}&sig=${data.sig}`,
  );
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown) =>
    request(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => request(path, { method: "DELETE" }),
  getBlob: (path: string) => requestBlob(path),
  postBlob: (path: string, body?: unknown) =>
    requestBlob(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};

export async function login(telegramId: string, password: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildApiUrl(`${API_BASE}/auth/login`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, password }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(i18n.t("login.invalidCredentials"));
    const data = await res.json();
    setToken(data.token);
    return data;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(i18n.t("common.requestFailed"));
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginWithTelegram(initData: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildApiUrl(`${API_BASE}/auth/telegram`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "" }));
      throw new Error(err.error || i18n.t("login.telegramLoginFailed"));
    }
    const data = await res.json();
    setToken(data.token);
    return data;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(i18n.t("common.requestFailed"));
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ─────────────────────────────────────────────────────────────
 * Phase D1 — postOrQueue: POST that falls back to the offline
 * queue when the network is unavailable.
 *
 * Returns either the server response (online success) or
 * { _queued: true, uuid } (queued for later sync). Callers must
 * check the discriminator before treating the result as a real
 * server payload.
 *
 * Only safe for endpoints whose POST body is self-contained and
 * non-derived (i.e. doesn't depend on a server-assigned id from a
 * previous call). For Phase D1 that's POST /mini-app/clients and
 * POST /quick-lead. Photo uploads, document registrations, and the
 * separate location-update PUT all stay online-only.
 * ──────────────────────────────────────────────────────────── */
export async function postOrQueue<T>(
  endpoint: string,
  body: unknown,
): Promise<T | { _queued: true; uuid: string }> {
  // Phase D1 followup — server-side idempotency. For create-client endpoints
  // we inject an `externalUuid` into the body BEFORE the first attempt. If
  // the request is later replayed from the offline queue (because the
  // original POST committed on the server but the response was lost in
  // transit), the SAME externalUuid travels with it. The server's
  // ON CONFLICT (external_uuid) DO NOTHING + RETURNING then detects the
  // replay and returns the existing row instead of creating a duplicate.
  //
  // We only inject for endpoints we know the server treats idempotently —
  // adding the field to a body the server rejects as "unknown key" would
  // break unrelated endpoints.
  const bodyToSend = injectExternalUuidIfNeeded(endpoint, body);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const uuid = await enqueue({ endpoint, body: bodyToSend });
    return { _queued: true, uuid };
  }
  try {
    return (await api.post(endpoint, bodyToSend)) as T;
  } catch (err: unknown) {
    // Network failure even though we thought we were online — queue it.
    // fetch() throws TypeError on network failure; our request() helper
    // re-throws an AbortError-derived "common.requestFailed" Error too.
    const isNetworkError =
      err instanceof TypeError ||
      (err instanceof Error && err.message === i18n.t("common.requestFailed"));
    if (isNetworkError) {
      const uuid = await enqueue({ endpoint, body: bodyToSend });
      return { _queued: true, uuid };
    }
    throw err;
  }
}

// Endpoints whose POST handler accepts (and dedupes on) `externalUuid`.
const IDEMPOTENT_POST_ENDPOINTS = new Set<string>(["/mini-app/clients"]);

function injectExternalUuidIfNeeded(endpoint: string, body: unknown): unknown {
  if (!IDEMPOTENT_POST_ENDPOINTS.has(endpoint)) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  // Caller already supplied one — respect it (keeps replay semantics intact
  // if a higher-level caller manages its own retry cycle).
  if ("externalUuid" in body && (body as Record<string, unknown>).externalUuid) {
    return body;
  }
  // crypto.randomUUID() is available in all evergreen browsers and in the
  // Telegram WebApp WebView. If for some reason it isn't, fall through with
  // the original body — the server will fall back to its DB default (a
  // freshly-generated UUID) and we lose only the replay-dedup property.
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    return body;
  }
  return { ...(body as Record<string, unknown>), externalUuid: crypto.randomUUID() };
}

export async function getMe() {
  return api.get("/auth/me");
}

export async function getGuestUser() {
  return api.get("/auth/guest");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return api.post("/auth/change-password", { currentPassword, newPassword });
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {}
  clearToken();
}
