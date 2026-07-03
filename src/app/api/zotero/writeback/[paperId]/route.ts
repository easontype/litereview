import { NextRequest, NextResponse } from "next/server";
import { getKeypoints, getPaper, getZoteroNoteKey, setZoteroNoteKey } from "@/lib/db";
import { buildNoteHtml } from "@/lib/zotero/note-html";
import { getZoteroApiKey, writeNote } from "@/lib/zotero/web-api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;

  const paper = getPaper(paperId);
  if (!paper) return NextResponse.json({ error: "找不到論文" }, { status: 404 });
  if (!paper.zoteroKey) {
    return NextResponse.json({ error: "這篇論文不是從 Zotero 匯入的，沒有可回寫的條目" }, { status: 400 });
  }

  const keypoints = getKeypoints(paperId);
  if (!keypoints) {
    return NextResponse.json({ error: "尚未分析重點，先執行「找重點」再回寫" }, { status: 400 });
  }

  if (!getZoteroApiKey()) {
    return NextResponse.json(
      { error: "尚未設定 Zotero API key", needsApiKey: true },
      { status: 400 }
    );
  }

  try {
    const result = await writeNote(paper.zoteroKey, buildNoteHtml(paper, keypoints), getZoteroNoteKey(paperId));
    setZoteroNoteKey(paperId, result.noteKey);
    return NextResponse.json({ status: "ok", action: result.action, noteKey: result.noteKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "回寫 Zotero 失敗" },
      { status: 502 }
    );
  }
}
