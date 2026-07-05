import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const CHAT_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads", "chat");

/** 允許的圖片類型（副檔名 → MIME），也是上傳驗證的單一來源。 */
export const CHAT_IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const NAME_PATTERN = /^[0-9a-f]{16}\.(png|jpg|jpeg|webp)$/;

export function extFromMime(mime: string): string | null {
  const entry = Object.entries(CHAT_IMAGE_MIME).find(([, m]) => m === mime);
  return entry ? entry[0] : null;
}

/** 存聊天圖片，回傳檔名（16 hex + 副檔名，讀取端以嚴格 regex 防路徑穿越）。 */
export function saveChatImage(buffer: Buffer, ext: string): string {
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
  const name = `${createHash("sha1").update(buffer).update(String(Math.random())).digest("hex").slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(CHAT_UPLOAD_DIR, name), buffer);
  return name;
}

export function getChatImage(name: string): { buffer: Buffer; mime: string } | null {
  if (!NAME_PATTERN.test(name)) return null;
  const filePath = path.join(CHAT_UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  const ext = name.slice(name.lastIndexOf(".") + 1);
  return { buffer: fs.readFileSync(filePath), mime: CHAT_IMAGE_MIME[ext] };
}
