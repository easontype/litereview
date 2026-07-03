import { NextRequest, NextResponse } from "next/server";
import { getPaper, getReview, saveReview } from "@/lib/db";
import { ensureKeypoints } from "@/lib/keypoints/analyze";
import { getFullText } from "@/lib/fulltext";
import { getUploadedPdf } from "@/lib/fulltext/upload-store";
import { buildReviewPrompt } from "@/lib/review/prompt";
import { parseReviewResponse } from "@/lib/review/parse";
import { resolveSeat } from "@/lib/llm/registry";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const review = getReview(paperId);
  if (!review) return NextResponse.json({ error: "尚未審查" }, { status: 404 });
  return NextResponse.json({ status: "done", review });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const paper = getPaper(paperId);
  if (!paper) return NextResponse.json({ error: "找不到論文" }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const forceRefresh = Boolean((body as { forceRefresh?: boolean }).forceRefresh);

  const existing = getReview(paperId);
  if (existing && !forceRefresh) {
    return NextResponse.json({ status: "done", review: existing });
  }

  try {
    // 品質閘門的前置：沒有 keypoints 就先跑找重點（重用 Phase 3/4 的既有流程）
    const keypoints = await ensureKeypoints(paperId);

    const fullText = await getFullText(
      { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
      getUploadedPdf(paperId)
    );

    const prompt = buildReviewPrompt(paper, keypoints, fullText.text, fullText.source === "abstract_only");
    const seat = resolveSeat("reviewer");
    const raw = await seat.provider.chat(prompt, { model: seat.model });
    const data = parseReviewResponse(raw);

    const seatInfo = `${seat.provider.label} · ${seat.model}`;
    saveReview(paperId, data, seatInfo);
    return NextResponse.json({ status: "done", review: getReview(paperId)! });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
