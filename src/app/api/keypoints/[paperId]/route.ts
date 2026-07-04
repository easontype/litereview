import { NextRequest, NextResponse } from "next/server";
import { getPaper, getKeypoints, saveKeypoints } from "@/lib/db";
import { getFullTextCached } from "@/lib/fulltext/store";
import { buildKeypointsPrompt } from "@/lib/keypoints/prompt";
import { parseKeypointsResponse } from "@/lib/keypoints/parse";
import { resolveSeat } from "@/lib/llm/registry";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const keypoints = getKeypoints(paperId);
  if (!keypoints) return NextResponse.json({ error: "尚未分析" }, { status: 404 });
  return NextResponse.json({ status: "done", keypoints });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const paper = getPaper(paperId);
  if (!paper) return NextResponse.json({ error: "找不到論文" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  let forceRefresh = false;
  let uploadBuffer: Buffer | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) uploadBuffer = Buffer.from(await file.arrayBuffer());
    forceRefresh = form.get("forceRefresh") === "true";
  } else {
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    forceRefresh = Boolean((body as { forceRefresh?: boolean }).forceRefresh);
  }

  const existing = getKeypoints(paperId);
  if (existing && !forceRefresh && !uploadBuffer) {
    return NextResponse.json({ status: "done", keypoints: existing });
  }

  let stage: "fetching_fulltext" | "analyzing" = "fetching_fulltext";
  try {
    // 沒帶檔案時 getFullTextCached 會自動退回本機已存的上傳 PDF 或 fulltexts 快取。
    const fullText = await getFullTextCached(
      paperId,
      { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
      uploadBuffer,
      { refresh: forceRefresh }
    );
    if (fullText.source === "abstract_only" && !fullText.text.trim()) {
      throw new Error("找不到可分析的內容：PDF 抽不出文字（可能是掃描影像檔），且沒有摘要可退回；可在設定頁掛外部 PDF 轉換工具再試");
    }

    stage = "analyzing";
    const prompt = buildKeypointsPrompt(paper, fullText.text, fullText.source === "abstract_only");
    const seat = resolveSeat("keypoints");
    const raw = await seat.provider.chat(prompt, { model: seat.model });
    const data = parseKeypointsResponse(raw);
    saveKeypoints(paperId, fullText.source, data);

    return NextResponse.json({ status: "done", keypoints: getKeypoints(paperId)! });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "failed", stage, error: message }, { status: 500 });
  }
}
