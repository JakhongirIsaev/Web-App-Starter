import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Smoke tests for the mini-app API client. We don't go to the network — fetch
// is stubbed — but we do assert the shape of the requests so the contract
// with the backend (signed URL endpoint, bearer token attachment, no token
// in query string) is enforced from this side too.

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getSignedImageUrl", () => {
  it("POSTs the object path with a Bearer header and returns a query-signed URL", async () => {
    localStorage.setItem("miniapp_auth_token", "user-session-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exp: 1700000000, sig: "abc123" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getSignedImageUrl } = await import("../lib/api");
    const url = await getSignedImageUrl("/local-objects/docs/photo.jpg");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("/api/storage/signed-url");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer user-session-token");
    expect(init.body).toBe(JSON.stringify({ path: "/local-objects/docs/photo.jpg" }));

    expect(url).toContain("/api/storage/file");
    expect(url).toContain("path=" + encodeURIComponent("/local-objects/docs/photo.jpg"));
    expect(url).toContain("exp=1700000000");
    expect(url).toContain("sig=abc123");
    expect(url).not.toContain("token=");
  });

  it("propagates backend access-denied (404) instead of returning a usable URL", async () => {
    localStorage.setItem("miniapp_auth_token", "user-session-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Hujjat topilmadi" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getSignedImageUrl } = await import("../lib/api");
    await expect(getSignedImageUrl("/local-objects/other-user-doc.jpg")).rejects.toThrow(
      "Hujjat topilmadi",
    );
  });
});

describe("api authentication", () => {
  it("attaches Bearer token from localStorage to authenticated requests", async () => {
    localStorage.setItem("miniapp_auth_token", "abc");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../lib/api");
    await api.get("/auth/me");

    const init = mockFetch.mock.calls[0][1];
    expect(init.headers["Authorization"]).toBe("Bearer abc");
  });

  it("does not attach Authorization header when no token is stored", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../lib/api");
    await api.get("/health");

    const init = mockFetch.mock.calls[0][1];
    expect(init.headers["Authorization"]).toBeUndefined();
  });
});
