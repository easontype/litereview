import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { getZoteroApiKey } from "@/lib/zotero/web-api";

/** 只回傳有沒有設定，永遠不吐出 key 本身。 */
export async function GET() {
  return NextResponse.json({ hasKey: Boolean(getZoteroApiKey()) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey 為必填" }, { status: 400 });
  }
  setSetting("zotero_api_key", apiKey);
  if (getSetting("zotero_user_cache")) setSetting("zotero_user_cache", null);
  return NextResponse.json({ status: "ok" });
}

export async function DELETE() {
  setSetting("zotero_api_key", null);
  setSetting("zotero_user_cache", null);
  return NextResponse.json({ status: "ok" });
}
