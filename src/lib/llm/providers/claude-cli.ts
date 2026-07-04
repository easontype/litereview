import { runClaude, runClaudeStream } from "@/lib/llm/claude-cli";
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
    chatStream(prompt, options) {
      // 佔住佇列一格直到整條串流結束，維持「同時間只有一個 claude 行程」的不變量
      return {
        async *[Symbol.asyncIterator]() {
          let release!: () => void;
          const done = new Promise<void>((r) => (release = r));
          let start!: () => void;
          const turn = new Promise<void>((r) => (start = r));
          void enqueue(() => {
            start();
            return done;
          });
          await turn;
          try {
            yield* runClaudeStream(prompt, { model: options.model, timeoutMs: options.timeoutMs });
          } finally {
            release();
          }
        },
      };
    },
  };
}
