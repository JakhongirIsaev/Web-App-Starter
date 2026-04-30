import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getOllamaConfig,
  normalizeBase64Image,
  getCircuitBreakerState,
} from "../ai/ollama";

// ---------------------------------------------------------------------------
// stripReasoningBlocks is not exported from ollama.ts and there is no
// __testing export. We replicate the logic here (same approach as
// ai-fallback.test.ts) to cover this pure function.
// ---------------------------------------------------------------------------

function stripReasoningBlocks(content: string): string {
  const withoutThinkBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fencedMatch = withoutThinkBlocks.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : withoutThinkBlocks;
}

// ---------------------------------------------------------------------------
// Environment variable management for getOllamaConfig tests
// ---------------------------------------------------------------------------

describe("getOllamaConfig", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ["OLLAMA_URL", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_TIMEOUT_MS"];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it("returns default model gemma3:4b when OLLAMA_MODEL is not set", () => {
    const config = getOllamaConfig();
    expect(config.model).toBe("gemma3:4b");
  });

  it("reads OLLAMA_MODEL from env", () => {
    process.env.OLLAMA_MODEL = "llama3:8b";
    const config = getOllamaConfig();
    expect(config.model).toBe("llama3:8b");
  });

  it("trims whitespace from OLLAMA_MODEL", () => {
    process.env.OLLAMA_MODEL = "  llama3:8b  ";
    const config = getOllamaConfig();
    expect(config.model).toBe("llama3:8b");
  });

  it("reads OLLAMA_URL as the primary URL source", () => {
    process.env.OLLAMA_URL = "http://custom:11434";
    process.env.OLLAMA_BASE_URL = "http://fallback:11434";
    const config = getOllamaConfig();
    expect(config.url).toBe("http://custom:11434");
  });

  it("falls back to OLLAMA_BASE_URL when OLLAMA_URL is not set", () => {
    process.env.OLLAMA_BASE_URL = "http://fallback:11434";
    const config = getOllamaConfig();
    expect(config.url).toBe("http://fallback:11434");
  });

  it("falls back to localhost when neither OLLAMA_URL nor OLLAMA_BASE_URL is set", () => {
    const config = getOllamaConfig();
    expect(config.url).toBe("http://127.0.0.1:11434");
  });

  it("strips trailing slashes from URL", () => {
    process.env.OLLAMA_URL = "http://custom:11434///";
    const config = getOllamaConfig();
    expect(config.url).toBe("http://custom:11434");
  });

  it("trims whitespace from OLLAMA_URL", () => {
    process.env.OLLAMA_URL = "  http://custom:11434  ";
    const config = getOllamaConfig();
    expect(config.url).toBe("http://custom:11434");
  });

  it("reads OLLAMA_TIMEOUT_MS from env", () => {
    process.env.OLLAMA_TIMEOUT_MS = "60000";
    const config = getOllamaConfig();
    expect(config.timeoutMs).toBe(60000);
  });

  it("defaults timeout to 30000 when OLLAMA_TIMEOUT_MS is not set", () => {
    const config = getOllamaConfig();
    expect(config.timeoutMs).toBe(30_000);
  });

  it("defaults timeout to 30000 when OLLAMA_TIMEOUT_MS is not a valid number", () => {
    process.env.OLLAMA_TIMEOUT_MS = "not-a-number";
    const config = getOllamaConfig();
    expect(config.timeoutMs).toBe(30_000);
  });

  it("skips empty OLLAMA_URL and uses OLLAMA_BASE_URL", () => {
    process.env.OLLAMA_URL = "   ";
    process.env.OLLAMA_BASE_URL = "http://base:11434";
    const config = getOllamaConfig();
    expect(config.url).toBe("http://base:11434");
  });
});

// ---------------------------------------------------------------------------
// normalizeBase64Image
// ---------------------------------------------------------------------------

describe("normalizeBase64Image", () => {
  it("strips data URI prefix from a base64 image", () => {
    const input = "data:image/png;base64,iVBORw0KGgoAAAANS";
    expect(normalizeBase64Image(input)).toBe("iVBORw0KGgoAAAANS");
  });

  it("returns the string unchanged when no comma is present", () => {
    const input = "iVBORw0KGgoAAAANS";
    expect(normalizeBase64Image(input)).toBe("iVBORw0KGgoAAAANS");
  });

  it("handles data URI with jpeg content type", () => {
    const input = "data:image/jpeg;base64,/9j/4AAQSkZJRg";
    expect(normalizeBase64Image(input)).toBe("/9j/4AAQSkZJRg");
  });

  it("splits on the first comma via split limit", () => {
    const input = "data:image/png;base64,abc";
    expect(normalizeBase64Image(input)).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// stripReasoningBlocks (local copy of non-exported function)
// ---------------------------------------------------------------------------

describe("stripReasoningBlocks", () => {
  it("removes <think> blocks from content", () => {
    const input = "<think>reasoning here</think>Actual response";
    expect(stripReasoningBlocks(input)).toBe("Actual response");
  });

  it("removes multiple <think> blocks", () => {
    const input = "<think>first</think>Hello<think>second</think> world";
    expect(stripReasoningBlocks(input)).toBe("Hello world");
  });

  it("handles case-insensitive <think> tags", () => {
    const input = "<THINK>reasoning</THINK>Response text";
    expect(stripReasoningBlocks(input)).toBe("Response text");
  });

  it("removes multiline <think> blocks", () => {
    const input = "<think>\nline 1\nline 2\n</think>\nClean output";
    expect(stripReasoningBlocks(input)).toBe("Clean output");
  });

  it("unwraps fenced json code blocks", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(stripReasoningBlocks(input)).toBe('{"key": "value"}');
  });

  it("unwraps fenced code blocks without language tag", () => {
    const input = "```\nsome content\n```";
    expect(stripReasoningBlocks(input)).toBe("some content");
  });

  it("does not unwrap fenced blocks if there is text outside them", () => {
    const input = 'Prefix ```json\n{"key": "value"}\n```';
    expect(stripReasoningBlocks(input)).toBe(input);
  });

  it("returns plain text unchanged", () => {
    expect(stripReasoningBlocks("Hello world")).toBe("Hello world");
  });

  it("trims whitespace from the result", () => {
    expect(stripReasoningBlocks("  <think>x</think>  Hello  ")).toBe("Hello");
  });

  it("handles <think> block followed by fenced code block", () => {
    const input = '<think>reasoning</think>\n```json\n{"answer": 42}\n```';
    expect(stripReasoningBlocks(input)).toBe('{"answer": 42}');
  });

  it("returns empty string for content that is only a <think> block", () => {
    expect(stripReasoningBlocks("<think>only reasoning</think>")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getCircuitBreakerState — initial state
// ---------------------------------------------------------------------------

describe("getCircuitBreakerState", () => {
  it("reports closed circuit with zero failures on fresh import", () => {
    const state = getCircuitBreakerState();
    expect(state.isOpen).toBe(false);
    expect(state.consecutiveFailures).toBeGreaterThanOrEqual(0);
    expect(state.cooldownRemainingMs).toBe(0);
  });

  it("returns an object with the expected shape", () => {
    const state = getCircuitBreakerState();
    expect(state).toHaveProperty("isOpen");
    expect(state).toHaveProperty("consecutiveFailures");
    expect(state).toHaveProperty("cooldownRemainingMs");
    expect(typeof state.isOpen).toBe("boolean");
    expect(typeof state.consecutiveFailures).toBe("number");
    expect(typeof state.cooldownRemainingMs).toBe("number");
  });
});
