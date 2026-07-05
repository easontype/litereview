import { sseDataLines } from "@/lib/llm/sse";
import type {
  ChatOptions,
  ChatTurnMessage,
  LlmProvider,
  ProviderConfig,
} from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_TOKENS = 8192;

type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      >;
};

function toAnthropicMessages(messages: ChatTurnMessage[]): AnthropicMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((part) =>
            part.type === "text"
              ? { type: "text" as const, text: part.text }
              : {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: part.mimeType, data: part.data },
                }
          ),
  }));
}

/** 走 API key 計費的 Anthropic Messages API（訂閱 token 請用 claude-cli provider）。 */
export function createAnthropicProvider(config: ProviderConfig): LlmProvider {
  async function request(
    messages: AnthropicMessage[],
    options: ChatOptions,
    stream: boolean
  ): Promise<Response> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
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
    messages: AnthropicMessage[],
    options: ChatOptions
  ): AsyncGenerator<string> {
    const res = await request(messages, options, true);
    let sawText = false;
    for await (const payload of sseDataLines(res)) {
      let evt: { type?: string; delta?: { type?: string; text?: unknown } };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "error") {
        throw new Error(`${config.label} 串流錯誤：${payload.slice(0, 300)}`);
      }
      if (
        evt.type === "content_block_delta" &&
        evt.delta?.type === "text_delta" &&
        typeof evt.delta.text === "string"
      ) {
        sawText = true;
        yield evt.delta.text;
      }
    }
    if (!sawText) throw new Error(`${config.label} 回傳空內容`);
  }

  return {
    id: config.id,
    kind: "anthropic",
    label: config.label,
    async chat(prompt, options) {
      const res = await request([{ role: "user", content: prompt }], options, false);
      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      if (!text) throw new Error(`${config.label} 回傳空內容`);
      return text;
    },
    chatStream(prompt, options) {
      return streamText([{ role: "user", content: prompt }], options);
    },
    chatMessages(messages, options) {
      return streamText(toAnthropicMessages(messages), options);
    },
  };
}
