import { runCodex } from "@/lib/llm/codex-cli";
import { enqueue } from "@/lib/llm/queue";
import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

/**
 * 走本機 codex CLI（ChatGPT 訂閱）的 provider — 給辯論反方/裁判等座位一個
 * 非 Claude 的異質模型，打破 self-preference bias。
 * 與 claude-cli 共用同一條佇列：同時間只有一個本機 CLI 行程，避免資源互搶。
 * 未實作 chatStream：辯論等場景會由 adapter 層退回一次性 chat()（整段輸出）。
 */
export function createCodexCliProvider(config: ProviderConfig): LlmProvider {
  return {
    id: config.id,
    kind: "codex-cli",
    label: config.label,
    chat(prompt, options) {
      return enqueue(() => runCodex(prompt, { model: options.model, timeoutMs: options.timeoutMs }));
    },
  };
}
