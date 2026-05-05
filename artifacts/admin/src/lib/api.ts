import { setBaseUrl } from "@workspace/api-client-react";
import { buildJsonHeaders } from "./auth-headers";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/+$/, "");

setBaseUrl(apiOrigin || null);

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
}

/**
 * Mint a signed URL for a stored object (photo / scanned doc).
 *
 * The backend at `POST /api/storage/signed-url` returns one of two shapes
 * depending on the storage backend:
 *  - legacy local-FS: `{ exp, sig, expiresAt }` -- caller assembles the
 *    `/api/storage/file?path=...&exp=...&sig=...` URL.
 *  - R2 (new uploads):  `{ url, expiresIn }` -- already a full presigned URL
 *    the browser can hit directly.
 *
 * Mirrors the mini-app helper in `artifacts/mini-app/src/lib/api.ts`.
 */
export async function getSignedImageUrl(objectPath: string): Promise<string> {
  const res = await fetch(buildApiUrl("/api/storage/signed-url"), {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({ path: objectPath }),
  });
  if (!res.ok) {
    throw new Error(`signed-url failed: ${res.status}`);
  }
  const data = (await res.json()) as
    | { exp: number; sig: string; expiresAt?: number }
    | { url: string; expiresIn: number };

  if ("url" in data) {
    return data.url;
  }

  return buildApiUrl(
    `/api/storage/file?path=${encodeURIComponent(objectPath)}&exp=${data.exp}&sig=${data.sig}`,
  );
}
