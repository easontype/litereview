export type DebateRole = "proponent" | "opponent";

export type DebatePhase = "opening" | "rebuttal" | "closing";

export const PHASE_LABEL: Record<DebatePhase, string> = {
  opening: "立論",
  rebuttal: "駁論",
  closing: "結辯",
};

export const ROLE_LABEL: Record<DebateRole, string> = {
  proponent: "正方",
  opponent: "反方",
};

/** 辯論逐字稿的一個回合：誰、哪個階段、用了哪個模型、說了什麼。 */
export interface DebateTurn {
  role: DebateRole;
  phase: DebatePhase;
  /** 駁論輪次（1 起算），立論/結辯不帶。 */
  round?: number;
  /** 「provider label · model」，UI 顯示模型徽章用。 */
  seatInfo: string;
  content: string;
}

/**
 * 辯論引文庫的一條引文：辯手行文以【E1】這類標記回引，UI 渲染成可 hover 的 chip。
 * id 全場遞增（跨論文不重複）。
 */
export interface DebateEvidenceRef {
  id: string;
  /** 0 起算的論文序（引文庫顯示「論文 N」用）。 */
  paperIndex: number;
  paperId: string;
  /** 中文欄名（如「研究方法」）。 */
  field: string;
  quote: string;
  page: number | null;
}

/**
 * v1.9 外部證據庫的一張證據卡：從被辯論文的 OpenAlex 引文圖譜檢索、
 * 經期刊分級（Q1/Q2、CORE A*、A）與 LLM 相關性過濾後入庫。
 * 辯手行文以【X1】這類標記回引（與內部引文【E#】區隔）；正反方與裁判拿同一份。
 */
export interface ExternalEvidenceCard {
  /** "X1" 起全場遞增。 */
  id: string;
  /** OpenAlex work id（如 "W2741809807"）。 */
  workId: string;
  title: string;
  /** 摘要逐字引用（abstract_inverted_index 還原，不經 LLM 改寫）。 */
  abstract: string;
  venue: string | null;
  year: number | null;
  doi: string | null;
  /** 分級標籤（"Q1" / "Q2" / "A*" / "A"）。 */
  rank: string;
  citedByCount: number | null;
  /** 與辯題的關聯註記（相關性過濾 LLM 產出，一句話）。 */
  relevance: string;
}

/** v1.6 以前的單裁判判決（僅供舊紀錄降級顯示；新判決一律是 DebateVerdictV2）。 */
export interface DebateVerdict {
  winner: DebateRole | "draw";
  proponentScore: number;
  opponentScore: number;
  reasoning: string;
  seatInfo: string;
}

/** v1.7 判決 rubric 的四個分項維度。 */
export const VERDICT_CRITERIA = [
  "argument_quality",
  "evidence_use",
  "rebuttal_strength",
  "responsiveness",
] as const;

export type VerdictCriterion = (typeof VERDICT_CRITERIA)[number];

export const CRITERION_LABEL: Record<VerdictCriterion, string> = {
  argument_quality: "論點品質",
  evidence_use: "證據運用",
  rebuttal_strength: "反駁力度",
  responsiveness: "回應完整度",
};

export interface ScoreWithReason {
  score: number;
  reason: string;
}

/**
 * 單一裁判的分項判決：LLM 只給四維分數與理由，
 * 總分（四維平均，一位小數）與 winner（總分差 < 0.5 判 draw）由程式計算——評分不再是黑箱。
 */
export interface JudgeVerdict {
  winner: DebateRole | "draw";
  criteria: Record<VerdictCriterion, { proponent: ScoreWithReason; opponent: ScoreWithReason }>;
  proponentTotal: number;
  opponentTotal: number;
  reasoning: string;
  seatInfo: string;
}

/** 每方的引文硬指標（程式從逐字稿掃【E#】算出，零 LLM）。 */
export interface CitationStats {
  /** 引用總次數。 */
  total: number;
  /** 不重複引文數。 */
  unique: number;
}

/** v1.7 合議判決：多裁判獨立判決＋程式聚合，一致度即信心指標。 */
export interface DebateVerdictV2 {
  version: 2;
  judges: JudgeVerdict[];
  /** 多數決；三方（正/反/平手）各一票時判 draw。 */
  finalWinner: DebateRole | "draw";
  /** 一致度："3/3"（全體一致）、"2/1"（分裂）、"1/1"（單裁判）、"1/1/1"（三方各執一詞）。 */
  agreement: string;
  /** 各維度分數跨裁判的 [min, max] 區間。 */
  scoreRange: Record<VerdictCriterion, { proponent: [number, number]; opponent: [number, number] }>;
  citationStats: Record<DebateRole, CitationStats>;
}

export type AnyDebateVerdict = DebateVerdict | DebateVerdictV2;

/** 型別守衛：判斷是否為 v1.7 合議判決（舊紀錄走 legacy 顯示）。 */
export function isVerdictV2(verdict: AnyDebateVerdict): verdict is DebateVerdictV2 {
  return "judges" in verdict;
}

/** 一位小數四捨五入。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** parse 單一裁判的 LLM 回應（JSON：criteria 四維每方 score/reason + reasoning），容錯處理 code fence；總分與 winner 由程式算。 */
export function parseVerdictResponse(raw: string, seatInfo: string): JudgeVerdict {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("裁判回應中找不到 JSON 物件");

  const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  const rawCriteria = parsed.criteria as
    | Record<string, { proponent?: { score?: unknown; reason?: unknown }; opponent?: { score?: unknown; reason?: unknown } }>
    | undefined;
  if (!rawCriteria || typeof rawCriteria !== "object") throw new Error("裁判回應缺少 criteria");

  const clamp = (v: unknown): number =>
    typeof v === "number" ? Math.max(1, Math.min(10, Math.round(v))) : 0;

  const criteria = {} as JudgeVerdict["criteria"];
  for (const criterion of VERDICT_CRITERIA) {
    const entry = rawCriteria[criterion];
    const p = entry?.proponent;
    const o = entry?.opponent;
    if (!p || !o || typeof p.score !== "number" || typeof o.score !== "number") {
      throw new Error(`裁判回應缺少分項維度或型別錯誤: ${criterion}`);
    }
    criteria[criterion] = {
      proponent: { score: clamp(p.score), reason: typeof p.reason === "string" ? p.reason : "" },
      opponent: { score: clamp(o.score), reason: typeof o.reason === "string" ? o.reason : "" },
    };
  }

  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  if (!reasoning) throw new Error("裁判回應缺少 reasoning");

  const proponentTotal = round1(
    VERDICT_CRITERIA.reduce((acc, c) => acc + criteria[c].proponent.score, 0) / VERDICT_CRITERIA.length
  );
  const opponentTotal = round1(
    VERDICT_CRITERIA.reduce((acc, c) => acc + criteria[c].opponent.score, 0) / VERDICT_CRITERIA.length
  );
  const winner: DebateRole | "draw" =
    Math.abs(proponentTotal - opponentTotal) < 0.5
      ? "draw"
      : proponentTotal > opponentTotal
        ? "proponent"
        : "opponent";

  return { winner, criteria, proponentTotal, opponentTotal, reasoning, seatInfo };
}

/** 聚合多位裁判的判決：多數決定勝方、算一致度與各維度分數區間（全程式、無 LLM）。 */
export function aggregateVerdicts(
  judges: JudgeVerdict[],
  citationStats: Record<DebateRole, CitationStats>
): DebateVerdictV2 {
  if (judges.length === 0) throw new Error("至少需要一位裁判的判決");

  const tally = new Map<DebateRole | "draw", number>();
  for (const j of judges) tally.set(j.winner, (tally.get(j.winner) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [topWinner, topCount] = ranked[0];
  // 多數決：最高票 ≥ 2 票（或只有一位裁判）才算定案；三方各一票時判 draw
  const finalWinner: DebateRole | "draw" =
    judges.length === 1 || topCount > 1 ? topWinner : "draw";

  const agreement =
    ranked.length === 1
      ? `${judges.length}/${judges.length}`
      : ranked.map(([, count]) => count).join("/");

  const scoreRange = {} as DebateVerdictV2["scoreRange"];
  for (const criterion of VERDICT_CRITERIA) {
    const pScores = judges.map((j) => j.criteria[criterion].proponent.score);
    const oScores = judges.map((j) => j.criteria[criterion].opponent.score);
    scoreRange[criterion] = {
      proponent: [Math.min(...pScores), Math.max(...pScores)],
      opponent: [Math.min(...oScores), Math.max(...oScores)],
    };
  }

  return { version: 2, judges, finalWinner, agreement, scoreRange, citationStats };
}

/** 從逐字稿計算每方引文硬指標：引用總次數與不重複引文數。 */
export function computeCitationStats(transcript: DebateTurn[]): Record<DebateRole, CitationStats> {
  const stats: Record<DebateRole, CitationStats> = {
    proponent: { total: 0, unique: 0 },
    opponent: { total: 0, unique: 0 },
  };
  const seen: Record<DebateRole, Set<string>> = { proponent: new Set(), opponent: new Set() };
  for (const turn of transcript) {
    for (const match of turn.content.matchAll(/【(E\d+)】/g)) {
      stats[turn.role].total += 1;
      seen[turn.role].add(match[1]);
    }
  }
  stats.proponent.unique = seen.proponent.size;
  stats.opponent.unique = seen.opponent.size;
  return stats;
}

/** 取每方已引用過的【E#】集合（供駁論/結辯 prompt 注入「不得重複引用」清單）。 */
export function usedEvidenceIds(transcript: DebateTurn[], role: DebateRole): string[] {
  const ids = new Set<string>();
  for (const turn of transcript) {
    if (turn.role !== role) continue;
    for (const match of turn.content.matchAll(/【(E\d+)】/g)) ids.add(match[1]);
  }
  return [...ids];
}
