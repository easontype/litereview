import { runClaude } from "@/lib/llm/claude-cli";
import { enqueue } from "@/lib/llm/queue";
import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

/** 走本機 claude CLI 訂閱 token 的 provider；CLI 行程以佇列序列化，避免同時開多個。 */
export function createClaudeCliProvider(config: ProviderConfig): LlmProvider {
  return {
    id: config.id,
    kind: "claude-cli",
    label: config.label,
    chat(prompt, options) {
      return enqueue(() => runClaude(prompt, { model: options.model, timeoutMs: options.timeoutMs }));
    },
  };
}
