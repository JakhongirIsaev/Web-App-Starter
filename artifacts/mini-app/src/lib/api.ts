const API_BASE = "/api";
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/+$/, "");

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

  const res = await fetch(buildApiUrl(`${API_BASE}${path}`), { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "So'rov bajarilmadi" }));
    throw new Error(err.error || "So'rov bajarilmadi");
  }
  return res.json();
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

  const res = await fetch(buildApiUrl(`${API_BASE}${path}`), { ...options, headers });
  if (!res.ok) {
    throw new Error("So'rov bajarilmadi");
  }
  return res.blob();
}

export function getAuthImageUrl(path: string): string {
  const token = getToken();
  const base = buildApiUrl(`${API_BASE}${path}`);
  return token ? `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : base;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) =>
    request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: any) =>
    request(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => request(path, { method: "DELETE" }),
  getBlob: (path: string) => requestBlob(path),
  postBlob: (path: string, body?: any) =>
    requestBlob(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};

export async function login(telegramId: string, password: string) {
  const res = await fetch(buildApiUrl(`${API_BASE}/auth/login`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, password }),
  });
  if (!res.ok) throw new Error("Kirish ma'lumotlari noto'g'ri");
  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function loginWithTelegram(initData: string) {
  const res = await fetch(buildApiUrl(`${API_BASE}/auth/telegram`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Telegram orqali kirib bo'lmadi" }));
    throw new Error(err.error || "Telegram orqali kirib bo'lmadi");
  }
  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function getMe() {
  return api.get("/auth/me");
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
