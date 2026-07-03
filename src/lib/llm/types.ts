/** LLM adapter 層的共用型別：provider 抽象 + 使用者可調配的座位設定。 */

export type ProviderKind =
  | "claude-cli"
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

export interface LlmProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  chat(prompt: string, options: ChatOptions): Promise<string>;
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

/** 六個「座位」：前兩個是既有功能，後四個是 v1.2 審查與辯論的角色。 */
export const SEAT_NAMES = [
  "keypoints",
  "compare",
  "reviewer",
  "proponent",
  "opponent",
  "judge",
] as const;

export type SeatName = (typeof SEAT_NAMES)[number];

export const SEAT_LABEL: Record<SeatName, string> = {
  keypoints: "找重點",
  compare: "比較",
  reviewer: "審查員",
  proponent: "辯論正方",
  opponent: "辯論反方",
  judge: "辯論裁判",
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
