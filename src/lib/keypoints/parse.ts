export interface KeypointsData {
  research_question: string;
  methodology: string;
  key_findings: string;
  data_experiments: string;
  contributions: string;
  limitations: string;
  novelty_rating: string;
  novelty_reason: string;
  key_formulas_or_algorithms: string[];
}

const REQUIRED_STRING_FIELDS = [
  "research_question",
  "methodology",
  "key_findings",
  "data_experiments",
  "contributions",
  "limitations",
  "novelty_rating",
  "novelty_reason",
] as const;

/** parse LLM 回傳的 JSON，容錯處理 ```json fence 與前後多餘文字。 */
export function parseKeypointsResponse(raw: string): KeypointsData {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("LLM 回應中找不到 JSON 物件");

  const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  for (const key of REQUIRED_STRING_FIELDS) {
    if (typeof parsed[key] !== "string") throw new Error(`LLM 回應缺少欄位或型別錯誤: ${key}`);
  }
  if (!Array.isArray(parsed.key_formulas_or_algorithms)) {
    parsed.key_formulas_or_algorithms = [];
  }

  return parsed as unknown as KeypointsData;
}
