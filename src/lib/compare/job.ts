import { getPaper, saveComparison } from "@/lib/db";
import { ensureKeypoints } from "@/lib/keypoints/analyze";
import { buildCompareEvidenceIndex, buildComparePrompt } from "./prompt";
import { parseCompareResponse } from "./parse";
import { resolveSeat } from "@/lib/llm/registry";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs/store";

/**
 * 比較的非同步 job 版：立即回傳 jobId；階段事件依序為
 * 各篇 ensureKeypoints（找重點 i/n）→ 比較分析中 → done（帶 compareId）。
 */
export function startCompareJob(paperIds: string[]): string {
  const jobId = `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  createJob(jobId);
  void run(jobId, paperIds);
  return jobId;
}

async function run(jobId: string, paperIds: string[]): Promise<void> {
  try {
    const papers = [];
    for (let i = 0; i < paperIds.length; i++) {
      const id = paperIds[i];
      const paper = getPaper(id);
      if (!paper) throw new Error(`找不到論文: ${id}`);
      emit(jobId, "stage", {
        stage: "keypoints",
        message: `找重點（${i + 1}/${paperIds.length}）：${paper.title.slice(0, 40)}…`,
      });
      const keypoints = await ensureKeypoints(id);
      papers.push({ id, title: paper.title, keypoints });
    }

    emit(jobId, "stage", { stage: "comparing", message: "五維比較分析中…" });
    const prompt = buildComparePrompt(papers);
    const { refs } = buildCompareEvidenceIndex(papers);
    const seat = resolveSeat("compare");
    const raw = await seat.provider.chat(prompt, { model: seat.model });
    const result = parseCompareResponse(raw, papers.length, refs);
    const compareId = saveComparison(paperIds, result);

    completeJob(jobId, { compareId });
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err));
  }
}
