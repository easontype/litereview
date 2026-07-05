import type { ChatOptions, ChatTurnMessage, LlmProvider } from "./types";

/** 訊息內容轉純文字（序列化 fallback 用；圖片 part 在上游就該被擋掉）。 */
function contentToText(content: ChatTurnMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** 把多輪歷史序列化成單一 prompt：給沒有 chatMessages 的 provider（如 claude-cli）。純文字排版，避免撞 mock 標記。 */
function serializeHistory(messages: ChatTurnMessage[]): string {
  const lines: string[] = ["以下是使用者與助理到目前為止的對話：", ""];
  for (const m of messages) {
    lines.push(`${m.role === "user" ? "使用者" : "助理"}：${contentToText(m.content)}`);
    lines.push("");
  }
  lines.push("請以助理身分，直接回覆最後一則使用者訊息（不要重複前綴、不要複述對話）。");
  return lines.join("\n");
}

export function messagesHaveImage(messages: ChatTurnMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image")
  );
}

/**
 * 多輪對話的統一串流入口：provider 有 chatMessages 就走結構化多輪（含圖片）；
 * 否則序列化成單 prompt 退回 chatStream / chat（帶圖片時丟明確錯誤）。
 */
export function streamChatReply(
  provider: LlmProvider,
  messages: ChatTurnMessage[],
  options: ChatOptions
): AsyncIterable<string> {
  if (provider.chatMessages) return provider.chatMessages(messages, options);
  if (messagesHaveImage(messages)) {
    throw new Error(`${provider.label} 不支援圖片訊息，請改用支援傳圖的 API provider`);
  }
  const prompt = serializeHistory(messages);
  if (provider.chatStream) return provider.chatStream(prompt, options);
  return {
    async *[Symbol.asyncIterator]() {
      yield await provider.chat(prompt, options);
    },
  };
}
