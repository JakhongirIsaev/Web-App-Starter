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

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getOllamaConfig() {
  return {
    url: stripTrailingSlash(process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434"),
    model: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
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

async function fetchOllamaJson<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

    return (await response.json()) as T;
  } catch (error) {
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
  timeoutMs = 45_000,
  temperature = 0.2,
  keepAlive = "10m",
}: OllamaChatRequest): Promise<{ model: string; content: string }> {
  const { model } = getOllamaConfig();

  const response = await fetchOllamaJson<OllamaChatResponse>(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        model,
        stream: false,
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
  const { model } = getOllamaConfig();

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
      modelAvailable: (tags.models ?? []).some((item) => modelMatches(model, item.name || item.model)),
      modelLoaded,
    };
  } catch {
    return {
      status: "degraded" as const,
      backendHealthy: true,
      ollamaReachable: false,
      model,
      modelAvailable: false,
      modelLoaded: null,
    };
  }
}
