import { EspoClient, EspoLeadPayload, EspoLeadResponse } from "./types";

export type EspoHealth = { ok: true; mode: "live" | "stub" } | { ok: false; mode: "live" | "stub"; error: string };

class StubEspoClient implements EspoClient {
  async createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse> {
    return {
      id: `stub-${idempotencyKey}`,
      name: p.fullName,
      status: "New",
      cLocalLeadUuid: p.cLocalLeadUuid,
    };
  }
  async findLeadByLocalUuid(): Promise<EspoLeadResponse | null> {
    return null;
  }
  async listRecentLeads(): Promise<EspoLeadResponse[]> {
    return [];
  }
}

class LiveEspoClient implements EspoClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async req<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Espo ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async createLead(p: EspoLeadPayload, idempotencyKey: string): Promise<EspoLeadResponse> {
    return this.req("/api/v1/Lead", {
      method: "POST",
      body: JSON.stringify(p),
      headers: { "X-Idempotency-Key": idempotencyKey },
    });
  }

  async findLeadByLocalUuid(localUuid: string): Promise<EspoLeadResponse | null> {
    const url =
      `/api/v1/Lead?where[0][type]=equals&where[0][attribute]=cLocalLeadUuid` +
      `&where[0][value]=${encodeURIComponent(localUuid)}`;
    const r = await this.req<{ list: EspoLeadResponse[] }>(url, { method: "GET" });
    return r.list[0] ?? null;
  }

  async listRecentLeads(since: Date): Promise<EspoLeadResponse[]> {
    const sinceIso = since.toISOString();
    const url =
      `/api/v1/Lead?where[0][type]=greaterThanOrEquals&where[0][attribute]=createdAt` +
      `&where[0][value]=${encodeURIComponent(sinceIso)}&select=id,name,status,cLocalLeadUuid&maxSize=200`;
    const r = await this.req<{ list: EspoLeadResponse[] }>(url, { method: "GET" });
    return r.list;
  }
}

let _client: EspoClient | null = null;
export function getEspoClient(): EspoClient {
  if (_client) return _client;
  const mode = process.env.ESPO_INTEGRATION ?? "stub";
  if (mode === "live") {
    const baseUrl = process.env.ESPO_BASE_URL;
    const apiKey = process.env.ESPO_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("ESPO_INTEGRATION=live requires ESPO_BASE_URL and ESPO_API_KEY");
    }
    _client = new LiveEspoClient(baseUrl, apiKey);
  } else {
    _client = new StubEspoClient();
  }
  return _client;
}

// Lightweight health check — calls Espo's /User/me endpoint with a short
// timeout. Stub mode always reports OK so the admin UI shows "stub" instead
// of "down" when integration isn't configured.
export async function checkEspoHealth(): Promise<EspoHealth> {
  const mode = (process.env.ESPO_INTEGRATION ?? "stub") === "live" ? "live" : "stub";
  if (mode === "stub") return { ok: true, mode };

  const baseUrl = process.env.ESPO_BASE_URL;
  const apiKey = process.env.ESPO_API_KEY;
  if (!baseUrl || !apiKey) {
    return { ok: false, mode, error: "missing_credentials" };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/v1/App/user`, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, mode, error: `http_${res.status}` };
    return { ok: true, mode };
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    return { ok: false, mode, error: name === "AbortError" ? "timeout" : String(err) };
  }
}

// Test helper
export function _resetEspoClientForTests(): void {
  _client = null;
}
