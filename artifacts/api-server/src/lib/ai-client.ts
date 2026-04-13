import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

type Provider = "ollama" | "anthropic";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatOptions = { maxTokens?: number; temperature?: number };

function resolveProvider(): Provider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "ollama" || explicit === "anthropic") return explicit;
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "ollama";
}

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "";
const OLLAMA_TIMEOUT_MS = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || "60000", 10);

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

async function ollamaRequest(path: string, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama ${path} returned ${res.status}: ${text.slice(0, 500)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaChat(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<string> {
  const body = {
    model: OLLAMA_MODEL,
    stream: false,
    think: false,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    options: {
      temperature: options?.temperature ?? 0.3,
      num_predict: options?.maxTokens ?? 1024,
    },
  };
  const data = await ollamaRequest("/api/chat", body);
  return data?.message?.content ?? "";
}

async function anthropicChat(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<string> {
  const ai = getAnthropic();
  const response = await ai.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.3,
    system: systemPrompt,
    messages,
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

export async function chatCompletion(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<string> {
  const provider = resolveProvider();
  return provider === "ollama"
    ? ollamaChat(systemPrompt, messages, options)
    : anthropicChat(systemPrompt, messages, options);
}

export async function visionExtract(
  systemPrompt: string,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg",
): Promise<string> {
  const provider = resolveProvider();

  if (provider === "ollama") {
    if (!OLLAMA_VISION_MODEL) {
      throw new Error(
        "OLLAMA_VISION_MODEL not configured — install a vision-capable model (e.g. gemma3:4b) and set OLLAMA_VISION_MODEL",
      );
    }
    const data = await ollamaRequest("/api/chat", {
      model: OLLAMA_VISION_MODEL,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "Extract all relevant information from this document image. Return structured JSON.",
          images: [imageBase64],
        },
      ],
      options: { temperature: 0.1, num_predict: 2048 },
    });
    return data?.message?.content ?? "{}";
  }

  const ai = getAnthropic();
  const response = await ai.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    temperature: 0.1,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Extract all relevant information from this document image. Return structured JSON." },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "{}";
}

export async function aiHealthCheck(): Promise<{ provider: Provider; ok: boolean; detail?: string }> {
  const provider = resolveProvider();
  try {
    if (provider === "ollama") {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { provider, ok: false, detail: `Ollama returned ${res.status}` };
      }
      return { provider, ok: true, detail: `${OLLAMA_BASE_URL} · model=${OLLAMA_MODEL}` };
    }
    getAnthropic();
    return { provider, ok: true };
  } catch (err: any) {
    return { provider, ok: false, detail: err?.message || String(err) };
  }
}

export function logAiConfig() {
  const provider = resolveProvider();
  if (provider === "ollama") {
    logger.info(
      { provider, baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL, visionModel: OLLAMA_VISION_MODEL || "(none)" },
      "AI provider configured",
    );
  } else {
    logger.info({ provider, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) }, "AI provider configured");
  }
}
