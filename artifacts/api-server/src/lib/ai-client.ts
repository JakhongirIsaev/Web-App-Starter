import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAIClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function chatCompletion(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const ai = getAIClient();
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

export async function visionExtract(
  systemPrompt: string,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg",
): Promise<string> {
  const ai = getAIClient();
  const response = await ai.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    temperature: 0.1,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Extract all relevant information from this document image. Return structured JSON.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "{}";
}
