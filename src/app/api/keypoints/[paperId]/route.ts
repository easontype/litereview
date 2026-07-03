import { NextRequest, NextResponse } from "next/server";
import { getPaper, getKeypoints, saveKeypoints } from "@/lib/db";
import { getFullText } from "@/lib/fulltext";
import { getUploadedPdf } from "@/lib/fulltext/upload-store";
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

  // 這次請求沒帶檔案的話，退回找使用者先前透過「上傳論文」存在本機的 PDF（避免要求重複上傳）。
  const fullTextBuffer = uploadBuffer ?? getUploadedPdf(paperId);

  let stage: "fetching_fulltext" | "analyzing" = "fetching_fulltext";
  try {
    const fullText = await getFullText(
      { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
      fullTextBuffer
    );
    if (fullText.source === "abstract_only" && !fullText.text.trim()) {
      throw new Error("找不到可分析的內容：PDF 解析失敗，且沒有摘要可退回（請確認已設定 MARKER_API_KEY）");
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
