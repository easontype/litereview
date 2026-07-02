export interface CompareData {
  methodology: string[];
  data_experiments: string[];
  contributions: string[];
  limitations: string[];
  novelty: string[];
  verdict: string;
}

const ARRAY_FIELDS = ["methodology", "data_experiments", "contributions", "limitations", "novelty"] as const;

/** parse LLM 回傳的比較結果 JSON，驗證五個陣列長度都等於論文數。 */
export function parseCompareResponse(raw: string, expectedLength: number): CompareData {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("LLM 回應中找不到 JSON 物件");

  const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  for (const key of ARRAY_FIELDS) {
    const value = parsed[key];
    if (!Array.isArray(value) || value.length !== expectedLength || !value.every((v) => typeof v === "string")) {
      throw new Error(`LLM 回應欄位錯誤: ${key} 需為長度 ${expectedLength} 的字串陣列`);
    }
  }
  if (typeof parsed.verdict !== "string") throw new Error("LLM 回應缺少 verdict 欄位");

  return parsed as unknown as CompareData;
}
