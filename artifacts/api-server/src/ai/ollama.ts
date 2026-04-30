type OllamaRole = "system" | "user" | "assistant";

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
  images?: string[];
}

interface OllamaChatRequest {
  messages: OllamaMessage[];
  format?: Record<string, unknown>;
  timeoutMs?: number;
  temperature?: number;
  keepAlive?: string;
  think?: boolean;
}

interface OllamaChatResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

interface OllamaPsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

export class OllamaRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "OllamaRequestError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/*  Circuit breaker – skip Ollama after consecutive failures           */
/* ------------------------------------------------------------------ */

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) return false;
  if (Date.now() >= circuitOpenUntil) {
    // Half-open: allow one probe attempt
    consecutiveFailures = CIRCUIT_BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

export function getCircuitBreakerState(): {
  isOpen: boolean;
  consecutiveFailures: number;
  cooldownRemainingMs: number;
} {
  const open = isCircuitOpen();
  return {
    isOpen: open,
    consecutiveFailures,
    cooldownRemainingMs: open ? Math.max(0, circuitOpenUntil - Date.now()) : 0,
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getOllamaConfig() {
  const url =
    process.env.OLLAMA_URL?.trim() ||
    process.env.OLLAMA_BASE_URL?.trim() ||
    "http://127.0.0.1:11434";
  return {
    url: stripTrailingSlash(url),
    model: process.env.OLLAMA_MODEL?.trim() || "gemma3:4b",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 30_000,
  };
}

function buildOllamaUrl(path: string) {
  const { url } = getOllamaConfig();
  return `${url}${path}`;
}

export function normalizeBase64Image(image: string): string {
  return image.includes(",") ? image.split(",", 2)[1]! : image;
}

function stripReasoningBlocks(content: string): string {
  const withoutThinkBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fencedMatch = withoutThinkBlocks.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : withoutThinkBlocks;
}

async function fetchOllamaJson<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const effectiveTimeout = timeoutMs ?? getOllamaConfig().timeoutMs;
  if (isCircuitOpen()) {
    throw new OllamaRequestError("Ollama circuit breaker is open – skipping request", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetch(buildOllamaUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OllamaRequestError(
        `Ollama request failed with ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
        response.status >= 400 && response.status < 600 ? response.status : 503,
      );
    }

    const result = (await response.json()) as T;
    recordSuccess();
    return result;
  } catch (error) {
    recordFailure();
    if (error instanceof OllamaRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaRequestError("Ollama request timed out", 504);
    }
    throw new OllamaRequestError(
      error instanceof Error ? error.message : "Unable to reach Ollama",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function ollamaChatText({
  messages,
  format,
  timeoutMs,
  temperature = 0.2,
  keepAlive = "30m",
  think = true,
}: OllamaChatRequest): Promise<{ model: string; content: string }> {
  const { model } = getOllamaConfig();

  const response = await fetchOllamaJson<OllamaChatResponse>(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        model,
        stream: false,
        think,
        keep_alive: keepAlive,
        format,
        options: {
          temperature,
        },
        messages: messages.map((message) => ({
          ...message,
          images: message.images?.map(normalizeBase64Image),
        })),
      }),
    },
    timeoutMs,
  );

  const content = stripReasoningBlocks(response.message?.content?.trim() || "");
  if (!content) {
    throw new OllamaRequestError("Ollama returned an empty response", 502);
  }

  return { model, content };
}

export async function ollamaChatJson<T>(request: OllamaChatRequest): Promise<{ model: string; data: T }> {
  const { model, content } = await ollamaChatText(request);

  try {
    return {
      model,
      data: JSON.parse(content) as T,
    };
  } catch (error) {
    throw new OllamaRequestError(
      `Ollama returned invalid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
      502,
    );
  }
}

function modelMatches(requestedModel: string, candidate?: string | null): boolean {
  if (!candidate) return false;
  return candidate === requestedModel || candidate.startsWith(`${requestedModel}:`) || requestedModel.startsWith(`${candidate}:`);
}

export async function getOllamaHealth() {
  const { model, url, timeoutMs } = getOllamaConfig();

  try {
    const tags = await fetchOllamaJson<OllamaTagsResponse>("/api/tags", {}, 10_000);
    let modelLoaded: boolean | null = null;

    try {
      const running = await fetchOllamaJson<OllamaPsResponse>("/api/ps", {}, 10_000);
      modelLoaded = (running.models ?? []).some((item) => modelMatches(model, item.name || item.model));
    } catch {
      modelLoaded = null;
    }

    return {
      status: "ok" as const,
      backendHealthy: true,
      ollamaReachable: true,
      model,
      url,
      timeoutMs,
      modelAvailable: (tags.models ?? []).some((item) => modelMatches(model, item.name || item.model)),
      modelLoaded,
      circuitBreaker: getCircuitBreakerState(),
    };
  } catch {
    return {
      status: "degraded" as const,
      backendHealthy: true,
      ollamaReachable: false,
      model,
      url,
      timeoutMs,
      modelAvailable: false,
      modelLoaded: null,
      circuitBreaker: getCircuitBreakerState(),
    };
  }
}
