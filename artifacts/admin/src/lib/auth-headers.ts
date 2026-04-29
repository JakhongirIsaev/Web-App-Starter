export function buildAuthHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const token = localStorage.getItem("auth_token");
  if (token) {
    result.set("Authorization", `Bearer ${token}`);
  }
  return result;
}

export function buildJsonHeaders(headers?: HeadersInit): Headers {
  const result = buildAuthHeaders(headers);
  if (!result.has("Content-Type")) {
    result.set("Content-Type", "application/json");
  }
  return result;
}
