import { getPaper, getKeypoints, saveKeypoints } from "@/lib/db";
import { getFullText } from "@/lib/fulltext";
import { getUploadedPdf } from "@/lib/fulltext/upload-store";
import { buildKeypointsPrompt } from "./prompt";
import { parseKeypointsResponse } from "./parse";
import { resolveSeat } from "@/lib/llm/registry";
import { completeJob, createJob, emit, failJob, getActiveJob, registerActive } from "@/lib/jobs/store";

export function keypointsJobKey(paperId: string): string {
  return `keypoints:${paperId}`;
}

/**
 * 找重點的非同步 job 版：立即回傳 jobId，進度走 SSE（stage: 抓全文 → 分析中 → done/failed）。
 * 同一篇論文已有進行中 job 時直接回傳該 job，避免重複觸發。
 */
export function startKeypointsJob(paperId: string, forceRefresh: boolean): string {
  const existing = getActiveJob(keypointsJobKey(paperId));
  if (existing) return existing;

  const jobId = `kp-${paperId}-${Date.now().toString(36)}`;
  createJob(jobId);
  registerActive(keypointsJobKey(paperId), jobId);
  void run(jobId, paperId, forceRefresh);
  return jobId;
}

async function run(jobId: string, paperId: string, forceRefresh: boolean): Promise<void> {
  try {
    const cached = getKeypoints(paperId);
    if (cached && !forceRefresh) {
      completeJob(jobId, { keypoints: cached });
      return;
    }

    const paper = getPaper(paperId);
    if (!paper) throw new Error(`找不到論文: ${paperId}`);

    emit(jobId, "stage", { stage: "fetching_fulltext", message: "抓取全文中…" });
    const fullText = await getFullText(
      { arxivId: paper.arxivId, doi: paper.doi, pdfUrl: paper.pdfUrl, abstract: paper.abstract },
      getUploadedPdf(paperId)
    );
    if (fullText.source === "abstract_only" && !fullText.text.trim()) {
      throw new Error("找不到可分析的內容：PDF 抽不出文字（可能是掃描影像檔），且沒有摘要可退回；可在設定頁掛外部 PDF 轉換工具再試");
    }

    emit(jobId, "stage", {
      stage: "analyzing",
      message: fullText.source === "abstract_only" ? "分析中（僅摘要）…" : "分析中（全文）…",
    });
    const prompt = buildKeypointsPrompt(paper, fullText.text, fullText.source === "abstract_only");
    const seat = resolveSeat("keypoints");
    const raw = await seat.provider.chat(prompt, { model: seat.model });
    const data = parseKeypointsResponse(raw);
    saveKeypoints(paperId, fullText.source, data);

    completeJob(jobId, { keypoints: getKeypoints(paperId)! });
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err));
  }
}
