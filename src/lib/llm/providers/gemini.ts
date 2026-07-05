import { sseDataLines } from "@/lib/llm/sse";
import type {
  ChatOptions,
  ChatTurnMessage,
  LlmProvider,
  ProviderConfig,
} from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>;
};

function toGeminiContents(messages: ChatTurnMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts:
      typeof m.content === "string"
        ? [{ text: m.content }]
        : m.content.map((part) =>
            part.type === "text"
              ? { text: part.text }
              : { inline_data: { mime_type: part.mimeType, data: part.data } }
          ),
  }));
}

export function createGeminiProvider(config: ProviderConfig): LlmProvider {
  async function request(
    contents: GeminiContent[],
    options: ChatOptions,
    stream: boolean
  ): Promise<Response> {
    const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey ?? "",
      },
      body: JSON.stringify({
        contents,
        ...(options.maxTokens ? { generationConfig: { maxOutputTokens: options.maxTokens } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${config.label} 回應 ${res.status}：${body.slice(0, 300)}`);
    }
    return res;
  }

  async function* streamText(
    contents: GeminiContent[],
    options: ChatOptions
  ): AsyncGenerator<string> {
    const res = await request(contents, options, true);
    let sawText = false;
    for await (const payload of sseDataLines(res)) {
      let evt: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      const text = (evt.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (text) {
        sawText = true;
        yield text;
      }
    }
    if (!sawText) throw new Error(`${config.label} 回傳空內容`);
  }

  return {
    id: config.id,
    kind: "gemini",
    label: config.label,
    async chat(prompt, options) {
      const res = await request([{ role: "user", parts: [{ text: prompt }] }], options, false);
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!text) throw new Error(`${config.label} 回傳空內容`);
      return text;
    },
    chatStream(prompt, options) {
      return streamText([{ role: "user", parts: [{ text: prompt }] }], options);
    },
    chatMessages(messages, options) {
      return streamText(toGeminiContents(messages), options);
    },
  };
}
