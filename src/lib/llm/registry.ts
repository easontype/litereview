import { getSetting, setSetting } from "@/lib/db";
import { createClaudeCliProvider } from "./providers/claude-cli";
import { createOpenAiProvider } from "./providers/openai";
import { createGeminiProvider } from "./providers/gemini";
import { createAnthropicProvider } from "./providers/anthropic-api";
import { createMockProvider } from "./providers/mock";
import {
  SEAT_NAMES,
  type LlmConfig,
  type LlmProvider,
  type ProviderConfig,
  type ResolvedSeat,
  type SeatAssignment,
  type SeatName,
} from "./types";

const CONFIG_KEY = "llm_config";

/** 內建 provider：走本機訂閱 token、零額外花費，永遠存在、不可刪除。 */
export const BUILTIN_CLAUDE_CLI: ProviderConfig = {
  id: "claude-cli",
  kind: "claude-cli",
  label: "Claude Code CLI（訂閱）",
  models: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5"],
};

const DEFAULT_SEAT: SeatAssignment = { providerId: "claude-cli", model: "claude-sonnet-5" };

function defaultSeats(): Record<SeatName, SeatAssignment> {
  return Object.fromEntries(SEAT_NAMES.map((seat) => [seat, { ...DEFAULT_SEAT }])) as Record<
    SeatName,
    SeatAssignment
  >;
}

/** 讀取設定並補齊預設值：claude-cli 永遠在列、六個座位一定有指派。 */
export function getLlmConfig(): LlmConfig {
  let stored: Partial<LlmConfig> = {};
  const raw = getSetting(CONFIG_KEY);
  if (raw) {
    try {
      stored = JSON.parse(raw) as Partial<LlmConfig>;
    } catch {
      // 設定壞掉時退回預設，不讓整個功能癱瘓
    }
  }

  const extras = (stored.providers ?? []).filter((p) => p.id !== BUILTIN_CLAUDE_CLI.id);
  const providers = [BUILTIN_CLAUDE_CLI, ...extras];
  const seats = defaultSeats();
  for (const seat of SEAT_NAMES) {
    const assigned = stored.seats?.[seat];
    if (assigned && providers.some((p) => p.id === assigned.providerId)) {
      seats[seat] = assigned;
    }
  }
  return { providers, seats };
}

export function saveLlmConfig(config: LlmConfig) {
  setSetting(CONFIG_KEY, JSON.stringify(config));
}

export function instantiateProvider(config: ProviderConfig): LlmProvider {
  switch (config.kind) {
    case "claude-cli":
      return createClaudeCliProvider(config);
    case "openai":
    case "openai-compatible":
      return createOpenAiProvider(config);
    case "gemini":
      return createGeminiProvider(config);
    case "anthropic":
      return createAnthropicProvider(config);
    case "mock":
      return createMockProvider(config);
  }
}

/** 取得座位指派的 provider 實例與模型；指派失效時安全退回 claude-cli 預設。 */
export function resolveSeat(seat: SeatName): ResolvedSeat {
  const config = getLlmConfig();
  const assignment = config.seats[seat] ?? DEFAULT_SEAT;
  const providerConfig =
    config.providers.find((p) => p.id === assignment.providerId) ?? BUILTIN_CLAUDE_CLI;
  const model =
    assignment.providerId === providerConfig.id ? assignment.model : DEFAULT_SEAT.model;
  return { provider: instantiateProvider(providerConfig), model };
}
