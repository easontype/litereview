import { NextRequest, NextResponse } from "next/server";
import { BUILTIN_CLAUDE_CLI, BUILTIN_CODEX_CLI, getLlmConfig, saveLlmConfig } from "@/lib/llm/registry";
import { SEAT_NAMES, type LlmConfig, type ProviderConfig } from "@/lib/llm/types";

const VALID_KINDS = new Set(["claude-cli", "anthropic", "openai", "openai-compatible", "gemini", "mock"]);

function maskKey(key?: string): string | null {
  if (!key) return null;
  return `••••${key.slice(-4)}`;
}

/** 回傳設定，apiKey 永遠遮罩（只給 keyPreview），原始 key 不出後端。 */
export async function GET() {
  const config = getLlmConfig();
  return NextResponse.json({
    providers: config.providers.map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      baseUrl: p.baseUrl ?? null,
      models: p.models,
      hasKey: Boolean(p.apiKey),
      keyPreview: maskKey(p.apiKey),
      builtin: p.id === BUILTIN_CLAUDE_CLI.id,
    })),
    seats: config.seats,
  });
}

interface IncomingProvider {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
  models?: unknown;
}

/**
 * 儲存整份設定。incoming provider 沒帶 apiKey（或帶空字串）時沿用既有的 key，
 * 所以前端永遠不需要（也拿不到）原始 key。
 */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    providers?: IncomingProvider[];
    seats?: Record<string, { providerId?: unknown; model?: unknown }>;
  } | null;
  if (!body || !Array.isArray(body.providers)) {
    return NextResponse.json({ error: "providers 為必填" }, { status: 400 });
  }

  const existing = getLlmConfig();
  const providers: ProviderConfig[] = [];
  for (const p of body.providers) {
    if (typeof p.id !== "string" || !p.id.trim()) {
      return NextResponse.json({ error: "provider 缺少 id" }, { status: 400 });
    }
    if (p.id === BUILTIN_CLAUDE_CLI.id || p.id === BUILTIN_CODEX_CLI.id) continue; // 內建項不可覆寫，registry 會自動補上
    if (typeof p.kind !== "string" || !VALID_KINDS.has(p.kind)) {
      return NextResponse.json({ error: `不支援的 provider 類型: ${String(p.kind)}` }, { status: 400 });
    }
    const models = Array.isArray(p.models)
      ? p.models.filter((m): m is string => typeof m === "string" && m.trim() !== "")
      : [];
    if (models.length === 0) {
      return NextResponse.json({ error: `provider ${p.id} 至少需要一個模型名稱` }, { status: 400 });
    }
    const prev = existing.providers.find((e) => e.id === p.id);
    const incomingKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
    providers.push({
      id: p.id,
      kind: p.kind as ProviderConfig["kind"],
      label: typeof p.label === "string" && p.label.trim() ? p.label.trim() : p.id,
      apiKey: incomingKey || prev?.apiKey || undefined,
      baseUrl: typeof p.baseUrl === "string" && p.baseUrl.trim() ? p.baseUrl.trim() : undefined,
      models,
    });
  }

  const allProviders = [BUILTIN_CLAUDE_CLI, BUILTIN_CODEX_CLI, ...providers];
  const config: LlmConfig = { providers, seats: existing.seats };
  for (const seat of SEAT_NAMES) {
    const incoming = body.seats?.[seat];
    if (
      incoming &&
      typeof incoming.providerId === "string" &&
      typeof incoming.model === "string" &&
      allProviders.some((p) => p.id === incoming.providerId)
    ) {
      config.seats[seat] = { providerId: incoming.providerId, model: incoming.model };
    }
  }

  saveLlmConfig(config);
  return NextResponse.json({ status: "ok" });
}
