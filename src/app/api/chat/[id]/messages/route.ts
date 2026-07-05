import { NextRequest, NextResponse } from "next/server";
import { appendChatMessage, getChat, updateChat } from "@/lib/db";
import { getActiveJob } from "@/lib/jobs/store";
import { resolveChatProvider, startChatReplyJob } from "@/lib/chat/engine";
import { extFromMime, saveChatImage } from "@/lib/chat/image-store";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 送出使用者訊息（JSON {text} 或 multipart text+images[]）並啟動回覆 job。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  if (getActiveJob(`chat:${id}`)) {
    return NextResponse.json({ error: "上一則回覆仍在進行中" }, { status: 409 });
  }

  let text = "";
  const imageFiles: File[] = [];
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const rawText = form.get("text");
    text = typeof rawText === "string" ? rawText.trim() : "";
    for (const entry of form.getAll("images")) {
      if (entry instanceof File && entry.size > 0) imageFiles.push(entry);
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  }

  if (!text && imageFiles.length === 0) {
    return NextResponse.json({ error: "請輸入訊息" }, { status: 400 });
  }

  const images: string[] = [];
  if (imageFiles.length > 0) {
    const { provider } = resolveChatProvider(chat);
    if (typeof provider.chatMessages !== "function" || provider.kind === "claude-cli") {
      return NextResponse.json(
        { error: `${provider.label} 不支援圖片訊息，請改用支援傳圖的 API provider` },
        { status: 400 }
      );
    }
    if (imageFiles.length > MAX_IMAGES) {
      return NextResponse.json({ error: `一則訊息最多附 ${MAX_IMAGES} 張圖片` }, { status: 400 });
    }
    for (const file of imageFiles) {
      const ext = extFromMime(file.type);
      if (!ext) {
        return NextResponse.json({ error: `不支援的圖片格式: ${file.type || "未知"}` }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "圖片大小上限 5MB" }, { status: 400 });
      }
      images.push(saveChatImage(Buffer.from(await file.arrayBuffer()), ext));
    }
  }

  const messageId = appendChatMessage(id, "user", text, images);
  if (chat.title === "新對話" && text) {
    updateChat(id, { title: text.slice(0, 40) });
  }
  const jobId = startChatReplyJob(id);
  return NextResponse.json({ messageId, jobId });
}
