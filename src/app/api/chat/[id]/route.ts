import { NextRequest, NextResponse } from "next/server";
import { deleteChat, getChat, getPaper, listChatMessages, updateChat } from "@/lib/db";
import { getActiveJob } from "@/lib/jobs/store";
import { getLlmConfig } from "@/lib/llm/registry";
import { buildChatContext, MAX_CONTEXT_PAPERS } from "@/lib/chat/context";
import { resolveChatProvider } from "@/lib/chat/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) return NextResponse.json({ error: "找不到對話" }, { status: 404 });
  const { provider } = resolveChatProvider(chat);
  return NextResponse.json({
    chat,
    messages: listChatMessages(id),
    activeJobId: getActiveJob(`chat:${id}`),
    supportsImages: typeof provider.chatMessages === "function" && provider.kind !== "claude-cli",
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    providerId?: unknown;
    model?: unknown;
    paperIds?: unknown;
  };

  const patch: Parameters<typeof updateChat>[1] = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();

  const config = getLlmConfig();
  if (typeof body.providerId === "string") {
    const providerConfig = config.providers.find((p) => p.id === body.providerId);
    if (!providerConfig) {
      return NextResponse.json({ error: `找不到 provider: ${body.providerId}` }, { status: 400 });
    }
    patch.providerId = providerConfig.id;
    patch.model =
      typeof body.model === "string" && providerConfig.models.includes(body.model)
        ? body.model
        : providerConfig.models[0];
  } else if (typeof body.model === "string") {
    const providerConfig = config.providers.find((p) => p.id === chat.providerId);
    if (providerConfig && providerConfig.models.includes(body.model)) patch.model = body.model;
  }

  if (Array.isArray(body.paperIds)) {
    const paperIds = body.paperIds.filter((v): v is string => typeof v === "string");
    if (paperIds.length > MAX_CONTEXT_PAPERS) {
      return NextResponse.json({ error: `最多注入 ${MAX_CONTEXT_PAPERS} 篇論文` }, { status: 400 });
    }
    for (const pid of paperIds) {
      if (!getPaper(pid)) return NextResponse.json({ error: `找不到論文: ${pid}` }, { status: 404 });
    }
    patch.paperIds = paperIds;
  }

  updateChat(id, patch);
  const updated = getChat(id)!;
  // 回傳注入預覽（會順手把還沒抽過的全文抓進 fulltexts 快取），UI 依此顯示篇數/字數
  const context = await buildChatContext(updated.paperIds);
  return NextResponse.json({ chat: updated, injected: context.injected });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getChat(id)) return NextResponse.json({ error: "找不到對話" }, { status: 404 });
  deleteChat(id);
  return NextResponse.json({ ok: true });
}
