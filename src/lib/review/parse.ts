export interface ReviewScore {
  score: number;
  reason: string;
}

export interface ReviewMotion {
  statement: string;
  rationale: string;
}

export interface ReviewData {
  scores: {
    methodological_rigor: ReviewScore;
    evidence_strength: ReviewScore;
    novelty: ReviewScore;
    reproducibility: ReviewScore;
    clarity: ReviewScore;
  };
  strengths: string[];
  weaknesses: string[];
  motions: ReviewMotion[];
}

export const SCORE_DIMENSIONS = [
  "methodological_rigor",
  "evidence_strength",
  "novelty",
  "reproducibility",
  "clarity",
] as const;

export const SCORE_LABEL: Record<(typeof SCORE_DIMENSIONS)[number], string> = {
  methodological_rigor: "方法嚴謹度",
  evidence_strength: "證據強度",
  novelty: "新穎性",
  reproducibility: "可重現性",
  clarity: "寫作清晰度",
};

/** parse 審查 LLM 回應，容錯處理 code fence 與前後多餘文字（仿 keypoints/parse.ts）。 */
export function parseReviewResponse(raw: string): ReviewData {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("LLM 回應中找不到 JSON 物件");

  const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  const scores = parsed.scores as Record<string, { score?: unknown; reason?: unknown }> | undefined;
  if (!scores || typeof scores !== "object") throw new Error("LLM 回應缺少 scores");
  for (const dim of SCORE_DIMENSIONS) {
    const entry = scores[dim];
    if (!entry || typeof entry.score !== "number" || typeof entry.reason !== "string") {
      throw new Error(`LLM 回應缺少評分維度或型別錯誤: ${dim}`);
    }
    entry.score = Math.max(1, Math.min(10, Math.round(entry.score)));
  }

  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.filter((s): s is string => typeof s === "string")
    : [];
  const weaknesses = Array.isArray(parsed.weaknesses)
    ? parsed.weaknesses.filter((s): s is string => typeof s === "string")
    : [];

  const motions = Array.isArray(parsed.motions)
    ? parsed.motions.filter(
        (m): m is ReviewMotion =>
          Boolean(m) && typeof m.statement === "string" && typeof m.rationale === "string"
      )
    : [];
  if (motions.length === 0) throw new Error("LLM 回應缺少 motions（可辯論爭點）");

  return {
    scores: scores as unknown as ReviewData["scores"],
    strengths,
    weaknesses,
    motions,
  };
}

/** 五維平均分（一位小數），scorecard 頂部顯示用。 */
export function overallScore(data: ReviewData): number {
  const sum = SCORE_DIMENSIONS.reduce((acc, dim) => acc + data.scores[dim].score, 0);
  return Math.round((sum / SCORE_DIMENSIONS.length) * 10) / 10;
}
