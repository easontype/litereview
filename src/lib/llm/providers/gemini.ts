import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

const DEFAULT_TIMEOUT_MS = 600_000;

export function createGeminiProvider(config: ProviderConfig): LlmProvider {
  return {
    id: config.id,
    kind: "gemini",
    label: config.label,
    async chat(prompt, options) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey ?? "",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(options.maxTokens ? { generationConfig: { maxOutputTokens: options.maxTokens } } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${config.label} 回應 ${res.status}：${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!text) throw new Error(`${config.label} 回傳空內容`);
      return text;
    },
  };
}
