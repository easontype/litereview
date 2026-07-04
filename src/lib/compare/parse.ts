import type { EvidenceItem } from "@/lib/keypoints/parse";

const ARRAY_FIELDS = ["methodology", "data_experiments", "contributions", "limitations", "novelty"] as const;

export type CompareArrayField = (typeof ARRAY_FIELDS)[number];

export interface CompareData {
  methodology: string[];
  data_experiments: string[];
  contributions: string[];
  limitations: string[];
  novelty: string[];
  verdict: string;
  /** v1.6 起：各欄逐篇的出處引文（與陣列欄位同形狀）。舊紀錄沒有此欄，UI 需優雅降級。 */
  evidence?: Partial<Record<CompareArrayField, EvidenceItem[][]>>;
}

/**
 * evidence 是加值欄位：LLM 回的出處編號查表映射回引文，幻覺編號直接丟棄、
 * 每欄長度對齊論文數（截斷/補空）；任何格式問題都靜默降級，絕不讓整次比較失敗。
 */
export function sanitizeCompareEvidence(
  raw: unknown,
  expectedLength: number,
  refs: Map<string, EvidenceItem>
): CompareData["evidence"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Partial<Record<CompareArrayField, EvidenceItem[][]>> = {};
  for (const field of ARRAY_FIELDS) {
    const value = (raw as Record<string, unknown>)[field];
    if (!Array.isArray(value)) continue;
    const cells: EvidenceItem[][] = Array.from({ length: expectedLength }, (_, i) => {
      const cell = value[i];
      if (!Array.isArray(cell)) return [];
      const labels = [...new Set(cell.filter((r): r is string => typeof r === "string").map((r) => r.trim()))];
      return labels
        .map((label) => refs.get(label))
        .filter((item): item is EvidenceItem => Boolean(item));
    });
    if (cells.some((c) => c.length > 0)) out[field] = cells;
  }
  return Object.keys(out).length ? out : undefined;
}

/** parse LLM 回傳的比較結果 JSON，驗證五個陣列長度都等於論文數。 */
export function parseCompareResponse(
  raw: string,
  expectedLength: number,
  evidenceRefs?: Map<string, EvidenceItem>
): CompareData {
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

  const evidence = evidenceRefs ? sanitizeCompareEvidence(parsed.evidence, expectedLength, evidenceRefs) : undefined;
  if (evidence) parsed.evidence = evidence;
  else delete parsed.evidence;

  return parsed as unknown as CompareData;
}
