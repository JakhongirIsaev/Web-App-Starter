import i18n from "@/i18n";

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
