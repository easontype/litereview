import { NextRequest, NextResponse } from "next/server";
import { getLlmConfig, instantiateProvider } from "@/lib/llm/registry";

/** 對指定 provider 發最小請求驗證連線與 key（使用者手動觸發）。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    providerId?: string;
    model?: string;
  } | null;
  if (!body?.providerId) {
    return NextResponse.json({ error: "providerId 為必填" }, { status: 400 });
  }

  const config = getLlmConfig();
  const providerConfig = config.providers.find((p) => p.id === body.providerId);
  if (!providerConfig) {
    return NextResponse.json({ error: "找不到 provider（記得先儲存設定）" }, { status: 404 });
  }

  const model = body.model || providerConfig.models[0];
  try {
    const provider = instantiateProvider(providerConfig);
    const reply = await provider.chat("請只回覆「OK」兩個字。", {
      model,
      maxTokens: 16,
      timeoutMs: 60_000,
    });
    return NextResponse.json({ ok: true, model, reply: reply.slice(0, 80) });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      model,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
