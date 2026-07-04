export interface EvidenceItem {
  quote: string;
  /** 引文所在的 PDF 實體頁碼；全文沒有頁碼標記（arXiv HTML／外部轉換）時為 null。 */
  page: number | null;
}

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
  /** v1.5 起：逐欄位的原文出處引文。舊資料沒有此欄，UI 需優雅降級。 */
  evidence?: Record<string, EvidenceItem[]>;
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

const PAGE_MARKER_RE = /【第 \d+ 頁】/g;

/** evidence 是加值欄位：任何格式問題都靜默丟棄該項，絕不讓整次分析失敗。 */
export function sanitizeEvidence(raw: unknown): Record<string, EvidenceItem[]> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, EvidenceItem[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    const items = value
      .filter((e): e is { quote: unknown; page?: unknown } => Boolean(e) && typeof e === "object")
      .filter((e) => typeof e.quote === "string" && (e.quote as string).trim().length > 0)
      .map((e) => ({
        quote: (e.quote as string).replace(PAGE_MARKER_RE, "").trim().slice(0, 500),
        page: typeof e.page === "number" && e.page >= 1 ? Math.round(e.page) : null,
      }))
      .filter((e) => e.quote.length > 0);
    if (items.length) out[key] = items;
  }
  return Object.keys(out).length ? out : undefined;
}

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
    // 防 LLM 把頁碼標記回吐進內容欄位
    parsed[key] = (parsed[key] as string).replace(PAGE_MARKER_RE, "").trim();
  }
  if (!Array.isArray(parsed.key_formulas_or_algorithms)) {
    parsed.key_formulas_or_algorithms = [];
  }

  const evidence = sanitizeEvidence(parsed.evidence);
  if (evidence) parsed.evidence = evidence;
  else delete parsed.evidence;

  return parsed as unknown as KeypointsData;
}
