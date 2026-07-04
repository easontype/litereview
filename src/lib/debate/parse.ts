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

export interface DebateVerdict {
  winner: DebateRole | "draw";
  proponentScore: number;
  opponentScore: number;
  reasoning: string;
  seatInfo: string;
}

/** parse 裁判 LLM 回應（JSON：winner / proponent_score / opponent_score / reasoning），容錯處理 code fence。 */
export function parseVerdictResponse(raw: string, seatInfo: string): DebateVerdict {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("裁判回應中找不到 JSON 物件");

  const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

  const winner = parsed.winner;
  if (winner !== "proponent" && winner !== "opponent" && winner !== "draw") {
    throw new Error(`裁判回應的 winner 無效: ${String(winner)}`);
  }
  const clamp = (v: unknown) =>
    typeof v === "number" ? Math.max(1, Math.min(10, Math.round(v))) : 0;
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  if (!reasoning) throw new Error("裁判回應缺少 reasoning");

  return {
    winner,
    proponentScore: clamp(parsed.proponent_score),
    opponentScore: clamp(parsed.opponent_score),
    reasoning,
    seatInfo,
  };
}
