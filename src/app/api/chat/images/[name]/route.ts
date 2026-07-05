import { NextRequest } from "next/server";
import { getChatImage } from "@/lib/chat/image-store";

/** 聊天圖片讀取：檔名走嚴格 regex（16 hex + 副檔名）防路徑穿越。 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const image = getChatImage(name);
  if (!image) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
