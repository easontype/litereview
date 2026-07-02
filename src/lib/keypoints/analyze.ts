import { getPaper, getKeypoints, saveKeypoints, type KeypointsRow } from "@/lib/db";
import { getFullText } from "@/lib/fulltext";
import { buildKeypointsPrompt } from "./prompt";
import { parseKeypointsResponse } from "./parse";
import { runClaude } from "@/lib/llm/claude-cli";
import { enqueue } from "./queue";

/** 若論文尚未有 keypoints，同步觸發 F3 全文擷取＋分析流程（供 Phase 4 比較自動觸發使用）。 */
export async function ensureKeypoints(paperId: string): Promise<KeypointsRow> {
  const existing = getKeypoints(paperId);
  if (existing) return existing;

  const paper = getPaper(paperId);
  if (!paper) throw new Error(`找不到論文: ${paperId}`);

  return enqueue(async () => {
    const again = getKeypoints(paperId);
    if (again) return again;

    const fullText = await getFullText(
      { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
      null
    );
    const prompt = buildKeypointsPrompt(paper, fullText.text, fullText.source === "abstract_only");
    const raw = await runClaude(prompt);
    const data = parseKeypointsResponse(raw);
    saveKeypoints(paperId, fullText.source, data);
    return getKeypoints(paperId)!;
  });
}
