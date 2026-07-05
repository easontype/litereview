import { getPaper, getReview, saveReview, type ReviewRow } from "@/lib/db";
import { ensureKeypoints } from "@/lib/keypoints/analyze";
import { getFullTextCached } from "@/lib/fulltext/store";
import { resolveSeat } from "@/lib/llm/registry";
import { buildReviewPrompt } from "./prompt";
import { parseReviewResponse } from "./parse";

/** 審查的執行本體（API route 與 Chat /review 命令共用）：已有結果且未 forceRefresh 時直接回快取。 */
export async function runReview(paperId: string, forceRefresh = false): Promise<ReviewRow> {
  const paper = getPaper(paperId);
  if (!paper) throw new Error(`找不到論文: ${paperId}`);

  const existing = getReview(paperId);
  if (existing && !forceRefresh) return existing;

  // 品質閘門的前置：沒有 keypoints 就先跑找重點（重用 Phase 3/4 的既有流程）
  const keypoints = await ensureKeypoints(paperId);

  // 重用找重點時存下的全文快取，兩個分頁的出處頁碼才一致（也免去重複抽取）。
  const fullText = await getFullTextCached(paperId, {
    arxivId: paper.arxivId,
    doi: paper.doi,
    pdfUrl: paper.pdfUrl,
    abstract: paper.abstract,
  });

  const prompt = buildReviewPrompt(paper, keypoints, fullText.text, fullText.source === "abstract_only");
  const seat = resolveSeat("reviewer");
  const raw = await seat.provider.chat(prompt, { model: seat.model });
  const data = parseReviewResponse(raw);

  saveReview(paperId, data, `${seat.provider.label} · ${seat.model}`);
  return getReview(paperId)!;
}
