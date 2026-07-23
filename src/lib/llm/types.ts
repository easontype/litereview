/** LLM adapter 層的共用型別：provider 抽象 + 使用者可調配的座位設定。 */

export type ProviderKind =
  | "claude-cli"
  | "codex-cli"
  | "anthropic"
  | "openai"
  | "openai-compatible"
  | "gemini"
  | "mock";

export interface ChatOptions {
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** 多輪對話訊息的結構化內容：文字或 base64 圖片（v1.8 Chat 傳圖用）。 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface LlmProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  chat(prompt: string, options: ChatOptions): Promise<string>;
  /** 逐字串流（可選）：有實作的 provider 在辯論等場景提供 token 級輸出；沒有就退回 chat()。 */
  chatStream?(prompt: string, options: ChatOptions): AsyncIterable<string>;
  /**
   * 多輪對話串流（可選）：吃結構化訊息（含圖片），逐字 yield。
   * 沒實作的 provider 由 src/lib/llm/chat.ts 把歷史序列化成單 prompt 退回 chatStream/chat（不支援圖片）。
   */
  chatMessages?(messages: ChatTurnMessage[], options: ChatOptions): AsyncIterable<string>;
}

/** 存在 settings 表 llm_config JSON 裡的 provider 描述。 */
export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  apiKey?: string;
  /** openai-compatible 用：DeepSeek / Groq / Ollama 等相容端點的 base URL。 */
  baseUrl?: string;
  models: string[];
}

/** 八個「座位」：前兩個是既有功能，中四個是 v1.2 審查與辯論的角色，judge2/judge3 是 v1.7 合議庭（可指異質模型避免 self-preference bias）。 */
export const SEAT_NAMES = [
  "keypoints",
  "compare",
  "reviewer",
  "proponent",
  "opponent",
  "judge",
  "judge2",
  "judge3",
] as const;

export type SeatName = (typeof SEAT_NAMES)[number];

export const SEAT_LABEL: Record<SeatName, string> = {
  keypoints: "找重點",
  compare: "比較",
  reviewer: "審查員",
  proponent: "辯論正方",
  opponent: "辯論反方",
  judge: "辯論裁判",
  judge2: "辯論裁判二",
  judge3: "辯論裁判三",
};

export interface SeatAssignment {
  providerId: string;
  model: string;
}

export interface LlmConfig {
  providers: ProviderConfig[];
  seats: Record<SeatName, SeatAssignment>;
}

export interface ResolvedSeat {
  provider: LlmProvider;
  model: string;
}
