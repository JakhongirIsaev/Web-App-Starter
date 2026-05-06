const CHUNK_RELOAD_STORAGE_KEY = "minerva:chunk-reload-attempted";
const CHUNK_RELOAD_QUERY_PARAM = "minerva_reload";

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "ChunkLoadError",
  "Loading chunk",
] as const;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern.toLowerCase()),
  );
}

export function clearChunkReloadAttempt() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
  } catch {
    // Telegram WebView storage can be unavailable in some contexts.
  }

  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CHUNK_RELOAD_QUERY_PARAM)) return;
    url.searchParams.delete(CHUNK_RELOAD_QUERY_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // Non-fatal: leaving the cache-bust param in place is safe.
  }
}

export function reloadForFreshChunks(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(CHUNK_RELOAD_QUERY_PARAM)) return false;

    if (window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, Date.now().toString(36));

    url.searchParams.set(CHUNK_RELOAD_QUERY_PARAM, Date.now().toString(36));
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}
