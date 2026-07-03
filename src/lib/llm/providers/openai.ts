import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * OpenAI Chat Completions provider。kind = "openai-compatible" 時吃自訂 baseUrl，
 * 同一實作即可支援 DeepSeek / Groq / Ollama 等所有相容端點。
 */
export function createOpenAiProvider(config: ProviderConfig): LlmProvider {
  const baseUrl = (config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com") + "/v1/chat/completions";

  return {
    id: config.id,
    kind: config.kind,
    label: config.label,
    async chat(prompt, options) {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: "user", content: prompt }],
          ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${config.label} 回應 ${res.status}：${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${config.label} 回傳空內容`);
      return content;
    },
  };
}
