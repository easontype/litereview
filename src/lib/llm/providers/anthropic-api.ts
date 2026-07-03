import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_TOKENS = 8192;

/** 走 API key 計費的 Anthropic Messages API（訂閱 token 請用 claude-cli provider）。 */
export function createAnthropicProvider(config: ProviderConfig): LlmProvider {
  return {
    id: config.id,
    kind: "anthropic",
    label: config.label,
    async chat(prompt, options) {
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
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${config.label} 回應 ${res.status}：${body.slice(0, 300)}`);
      }
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
  };
}
