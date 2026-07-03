/**
 * Zotero Web API（api.zotero.org）——筆記回寫用。
 * 需要使用者在 https://www.zotero.org/settings/keys 建立一組具備「Allow write access」的 API key，
 * 存在 settings 表（key：zotero_api_key），或以環境變數 ZOTERO_API_KEY 提供。
 */
import { getSetting, setSetting } from "@/lib/db";

const WEB_BASE = "https://api.zotero.org";
const NOTE_TAG = "litereview";

export function getZoteroApiKey(): string | null {
  return getSetting("zotero_api_key") ?? process.env.ZOTERO_API_KEY ?? null;
}

function headers(apiKey: string): Record<string, string> {
  return { "Zotero-API-Key": apiKey, "Content-Type": "application/json" };
}

interface KeyInfo {
  userID: number;
  access?: { user?: { write?: boolean; notes?: boolean } };
}

/** 用 API key 換 userID，結果快取在 settings（key 變更時自動重查）。 */
async function getUserId(apiKey: string): Promise<number> {
  const cached = getSetting("zotero_user_cache");
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { apiKey: string; userId: number };
      if (parsed.apiKey === apiKey) return parsed.userId;
    } catch {
      // 快取壞掉就重查
    }
  }

  const res = await fetch(`${WEB_BASE}/keys/current`, { headers: headers(apiKey) });
  if (res.status === 403) throw new Error("Zotero API key 無效，請到 zotero.org/settings/keys 確認");
  if (!res.ok) throw new Error(`Zotero Web API 回應 ${res.status}`);
  const info = (await res.json()) as KeyInfo;
  if (!info.access?.user?.write) {
    throw new Error("這組 Zotero API key 沒有寫入權限，建立時請勾選「Allow write access」");
  }
  setSetting("zotero_user_cache", JSON.stringify({ apiKey, userId: info.userID }));
  return info.userID;
}

export interface WritebackResult {
  noteKey: string;
  action: "created" | "updated";
}

/** 在指定 Zotero 條目底下建立或更新 litereview 分析筆記。 */
export async function writeNote(
  parentItemKey: string,
  noteHtml: string,
  existingNoteKey: string | null
): Promise<WritebackResult> {
  const apiKey = getZoteroApiKey();
  if (!apiKey) {
    throw new Error("尚未設定 Zotero API key，請先在下方輸入（zotero.org/settings/keys 可建立）");
  }
  const userId = await getUserId(apiKey);

  if (existingNoteKey) {
    const updated = await updateNote(apiKey, userId, existingNoteKey, parentItemKey, noteHtml);
    if (updated) return { noteKey: existingNoteKey, action: "updated" };
    // 筆記在 Zotero 端被刪掉了 → 重新建立
  }

  const noteKey = await createNote(apiKey, userId, parentItemKey, noteHtml);
  return { noteKey, action: "created" };
}

async function createNote(
  apiKey: string,
  userId: number,
  parentItemKey: string,
  noteHtml: string
): Promise<string> {
  const res = await fetch(`${WEB_BASE}/users/${userId}/items`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify([
      { itemType: "note", parentItem: parentItemKey, note: noteHtml, tags: [{ tag: NOTE_TAG }] },
    ]),
  });
  if (!res.ok) throw new Error(`建立 Zotero 筆記失敗（${res.status}）`);

  const json = (await res.json()) as {
    successful?: Record<string, { key: string }>;
    failed?: Record<string, { code: number; message: string }>;
  };
  const created = json.successful?.["0"];
  if (!created) {
    const failure = json.failed?.["0"];
    throw new Error(`建立 Zotero 筆記失敗：${failure?.message ?? "未知錯誤"}`);
  }
  return created.key;
}

/** 回傳 false 表示筆記已不存在（呼叫端會改走建立）。 */
async function updateNote(
  apiKey: string,
  userId: number,
  noteKey: string,
  parentItemKey: string,
  noteHtml: string
): Promise<boolean> {
  const current = await fetch(`${WEB_BASE}/users/${userId}/items/${noteKey}`, {
    headers: headers(apiKey),
  });
  if (current.status === 404) return false;
  if (!current.ok) throw new Error(`讀取既有 Zotero 筆記失敗（${current.status}）`);

  const envelope = (await current.json()) as { version: number };
  const res = await fetch(`${WEB_BASE}/users/${userId}/items/${noteKey}`, {
    method: "PUT",
    headers: { ...headers(apiKey), "If-Unmodified-Since-Version": String(envelope.version) },
    body: JSON.stringify({
      itemType: "note",
      parentItem: parentItemKey,
      note: noteHtml,
      tags: [{ tag: NOTE_TAG }],
    }),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`更新 Zotero 筆記失敗（${res.status}）`);
  return true;
}
