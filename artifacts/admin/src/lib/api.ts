import { setBaseUrl } from "@workspace/api-client-react";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/+$/, "");

setBaseUrl(apiOrigin || null);

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
}
