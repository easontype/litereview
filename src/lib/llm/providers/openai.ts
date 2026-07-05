import { sseDataLines } from "@/lib/llm/sse";
import type {
  ChatOptions,
  ChatTurnMessage,
  LlmProvider,
  ProviderConfig,
} from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;

type OpenAiMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

function toOpenAiMessages(messages: ChatTurnMessage[]): OpenAiMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((part) =>
            part.type === "text"
              ? { type: "text" as const, text: part.text }
              : {
                  type: "image_url" as const,
                  image_url: { url: `data:${part.mimeType};base64,${part.data}` },
                }
          ),
  }));
}

/**
 * OpenAI Chat Completions provider。kind = "openai-compatible" 時吃自訂 baseUrl，
 * 同一實作即可支援 DeepSeek / Groq / Ollama 等所有相容端點。
 */
export function createOpenAiProvider(config: ProviderConfig): LlmProvider {
  const endpoint =
    (config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com") + "/v1/chat/completions";

  async function request(
    messages: OpenAiMessage[],
    options: ChatOptions,
    stream: boolean
  ): Promise<Response> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
        ...(stream ? { stream: true } : {}),
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
    messages: OpenAiMessage[],
    options: ChatOptions
  ): AsyncGenerator<string> {
    const res = await request(messages, options, true);
    let sawText = false;
    for await (const payload of sseDataLines(res)) {
      if (payload === "[DONE]") break;
      let evt: { choices?: Array<{ delta?: { content?: string | null } }> };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = evt.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        sawText = true;
        yield delta;
      }
    }
    if (!sawText) throw new Error(`${config.label} 回傳空內容`);
  }

  return {
    id: config.id,
    kind: config.kind,
    label: config.label,
    async chat(prompt, options) {
      const res = await request([{ role: "user", content: prompt }], options, false);
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${config.label} 回傳空內容`);
      return content;
    },
    chatStream(prompt, options) {
      return streamText([{ role: "user", content: prompt }], options);
    },
    chatMessages(messages, options) {
      return streamText(toOpenAiMessages(messages), options);
    },
  };
}
