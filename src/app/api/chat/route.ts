import { NextRequest, NextResponse } from "next/server";
import { createChat, getPaper, listChats } from "@/lib/db";
import { getLlmConfig } from "@/lib/llm/registry";
import { MAX_CONTEXT_PAPERS } from "@/lib/chat/context";

export async function GET() {
  return NextResponse.json({ chats: listChats() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    providerId?: unknown;
    model?: unknown;
    paperIds?: unknown;
  };

  const config = getLlmConfig();
  const providerId = typeof body.providerId === "string" ? body.providerId : "claude-cli";
  const providerConfig = config.providers.find((p) => p.id === providerId);
  if (!providerConfig) {
    return NextResponse.json({ error: `找不到 provider: ${providerId}` }, { status: 400 });
  }
  const model =
    typeof body.model === "string" && providerConfig.models.includes(body.model)
      ? body.model
      : providerConfig.models[0];

  const paperIds = Array.isArray(body.paperIds)
    ? body.paperIds.filter((id): id is string => typeof id === "string")
    : [];
  if (paperIds.length > MAX_CONTEXT_PAPERS) {
    return NextResponse.json({ error: `最多注入 ${MAX_CONTEXT_PAPERS} 篇論文` }, { status: 400 });
  }
  for (const id of paperIds) {
    if (!getPaper(id)) return NextResponse.json({ error: `找不到論文: ${id}` }, { status: 404 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新對話";
  const id = createChat(title, providerConfig.id, model, paperIds);
  return NextResponse.json({ id });
}
