import { getPaper, getKeypoints, saveKeypoints, type KeypointsRow } from "@/lib/db";
import { getFullText } from "@/lib/fulltext";
import { getUploadedPdf } from "@/lib/fulltext/upload-store";
import { buildKeypointsPrompt } from "./prompt";
import { parseKeypointsResponse } from "./parse";
import { resolveSeat } from "@/lib/llm/registry";

/** 若論文尚未有 keypoints，同步觸發 F3 全文擷取＋分析流程（供 Phase 4 比較自動觸發使用）。 */
export async function ensureKeypoints(paperId: string): Promise<KeypointsRow> {
  const existing = getKeypoints(paperId);
  if (existing) return existing;

  const paper = getPaper(paperId);
  if (!paper) throw new Error(`找不到論文: ${paperId}`);

  const fullText = await getFullText(
    { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
    getUploadedPdf(paperId)
  );
  if (fullText.source === "abstract_only" && !fullText.text.trim()) {
    throw new Error("找不到可分析的內容：PDF 抽不出文字（可能是掃描影像檔），且沒有摘要可退回；可在設定頁掛外部 PDF 轉換工具再試");
  }

  const prompt = buildKeypointsPrompt(paper, fullText.text, fullText.source === "abstract_only");
  const seat = resolveSeat("keypoints");
  const raw = await seat.provider.chat(prompt, { model: seat.model });
  const data = parseKeypointsResponse(raw);
  saveKeypoints(paperId, fullText.source, data);
  return getKeypoints(paperId)!;
}
