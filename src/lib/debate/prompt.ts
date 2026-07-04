import { EVIDENCE_FIELD_LABEL, type EvidenceItem } from "@/lib/keypoints/parse";
import {
  PHASE_LABEL,
  ROLE_LABEL,
  type DebateEvidenceRef,
  type DebatePhase,
  type DebateRole,
  type DebateTurn,
} from "./parse";

/** 與 db 的 KeypointsRow 結構相容（只取 prompt 需要的欄位）。 */
export interface DebatePaperContext {
  paperId: string;
  title: string;
  keypoints: {
    researchQuestion: string;
    methodology: string;
    keyFindings: string;
    dataExperiments: string;
    contributions: string;
    limitations: string;
    noveltyRating: string;
    noveltyReason: string;
    evidence?: Record<string, EvidenceItem[]>;
  };
}

/** 引文庫的截取上限：每篇每欄前 2 條、每篇上限 8 條、全場上限 40 條、quote 截 160 字（防 prompt 過長）。 */
const EVIDENCE_MAX_PER_FIELD = 2;
const EVIDENCE_MAX_PER_PAPER = 8;
const EVIDENCE_MAX_TOTAL = 40;
const EVIDENCE_QUOTE_MAX_CHARS = 160;

/** 把各論文既有的 keypoints 出處引文編成全場遞增的【E#】引文庫，辯手行文以編號回引。 */
export function buildDebateEvidenceIndex(papers: DebatePaperContext[]): DebateEvidenceRef[] {
  const refs: DebateEvidenceRef[] = [];
  papers.forEach((p, paperIndex) => {
    const evidence = p.keypoints.evidence;
    if (!evidence || refs.length >= EVIDENCE_MAX_TOTAL) return;
    const orderedFields = [
      ...Object.keys(EVIDENCE_FIELD_LABEL).filter((f) => f in evidence),
      ...Object.keys(evidence).filter((f) => !(f in EVIDENCE_FIELD_LABEL)),
    ];
    let count = 0;
    for (const field of orderedFields) {
      if (count >= EVIDENCE_MAX_PER_PAPER || refs.length >= EVIDENCE_MAX_TOTAL) break;
      for (const item of (evidence[field] ?? []).slice(0, EVIDENCE_MAX_PER_FIELD)) {
        if (count >= EVIDENCE_MAX_PER_PAPER || refs.length >= EVIDENCE_MAX_TOTAL) break;
        count += 1;
        refs.push({
          id: `E${refs.length + 1}`,
          paperIndex,
          paperId: p.paperId,
          field: EVIDENCE_FIELD_LABEL[field] ?? field,
          quote: item.quote.slice(0, EVIDENCE_QUOTE_MAX_CHARS),
          page: item.page,
        });
      }
    }
  });
  return refs;
}

function renderEvidenceLibrary(refs: DebateEvidenceRef[]): string {
  return refs
    .map((r) => {
      const pagePart = r.page !== null ? `・第 ${r.page} 頁` : "";
      return `【${r.id}】論文 ${r.paperIndex + 1}・${r.field}${pagePart}：「${r.quote}」`;
    })
    .join("\n");
}

/**
 * 論文脈絡用純文字排版（不用原始 JSON）：一來對模型更易讀，
 * 二來避免 keypoints JSON 的欄位名（"research_question" 等）撞到 mock provider 的判別標記。
 */
function renderPapersContext(papers: DebatePaperContext[]): string {
  return papers
    .map((p, i) => {
      const kp = p.keypoints;
      return [
        `【論文 ${i + 1}】${p.title}`,
        `研究問題：${kp.researchQuestion}`,
        `研究方法：${kp.methodology}`,
        `主要發現：${kp.keyFindings}`,
        `資料與實驗：${kp.dataExperiments}`,
        `主要貢獻：${kp.contributions}`,
        `侷限性：${kp.limitations}`,
        `新穎度：${kp.noveltyRating}（${kp.noveltyReason}）`,
      ].join("\n");
    })
    .join("\n\n");
}

function renderTranscript(transcript: DebateTurn[]): string {
  if (transcript.length === 0) return "（尚無發言）";
  return transcript
    .map((t) => {
      const round = t.round ? ` 第 ${t.round} 輪` : "";
      return `〔${ROLE_LABEL[t.role]}・${PHASE_LABEL[t.phase]}${round}〕\n${t.content}`;
    })
    .join("\n\n");
}

const PHASE_INSTRUCTION: Record<DebatePhase, Record<DebateRole, string>> = {
  opening: {
    proponent: "請發表立論：明確支持辯題，從論文證據中提出 2–3 個核心論點，每個論點都要引用具體的方法、實驗或發現。",
    opponent: "請發表立論：明確反對辯題，從論文的侷限、證據缺口或替代解釋中提出 2–3 個核心論點，並回應正方立論中最強的一點。",
  },
  rebuttal: {
    proponent: "請發表駁論：針對反方最新發言中最關鍵的 1–2 個攻擊點逐一反駁，引用論文證據，不要重複已講過的論點。",
    opponent: "請發表駁論：針對正方最新發言中最關鍵的 1–2 個攻擊點逐一反駁，引用論文證據，不要重複已講過的論點。",
  },
  closing: {
    proponent: "請發表結辯：總結我方（正方）在整場辯論中站得住腳的核心論點，指出反方未能有效回應之處，收束成支持辯題的最終陳述。",
    opponent: "請發表結辯：總結我方（反方）在整場辯論中站得住腳的核心論點，指出正方未能有效回應之處，收束成反對辯題的最終陳述。",
  },
};

/** 組正/反方發言 prompt：角色設定 + 論文脈絡（+ 引文庫）+ 目前逐字稿 + 階段指令。回應為純文字（非 JSON）。 */
export function buildSpeechPrompt(
  motion: string,
  papers: DebatePaperContext[],
  transcript: DebateTurn[],
  role: DebateRole,
  phase: DebatePhase,
  evidence: DebateEvidenceRef[] = []
): string {
  const evidenceBlock =
    evidence.length > 0
      ? `

## 引文庫
${renderEvidenceLibrary(evidence)}`
      : "";
  const evidenceRule =
    evidence.length > 0
      ? "\n- 引用證據時在該句句尾標注引文庫編號（如【E2】），只能使用引文庫中存在的編號；沒有合適引文的論點不要硬標。"
      : "";
  return `你是一場學術辯論中的${ROLE_LABEL[role]}辯手。辯論圍繞以下論文與辯題進行，評判標準是論證品質與證據運用，不是修辭。

## 辯題
${motion}

## 論文脈絡
${renderPapersContext(papers)}${evidenceBlock}

## 目前逐字稿
${renderTranscript(transcript)}

## 你的任務
${PHASE_INSTRUCTION[phase][role]}

要求：
- 用繁體中文，直接輸出發言內容本身，不要加「正方：」之類的前綴，不要用 markdown 標題。
- 控制在 300 字以內，論點編號清楚。
- 立場必須鮮明，禁止騎牆。${evidenceRule}`;
}

/** 組裁判 prompt：讀完整逐字稿後輸出 JSON 判決（含 "winner" 欄位，為 mock provider 的判別標記）。 */
export function buildVerdictPrompt(motion: string, transcript: DebateTurn[]): string {
  return `你是一場學術辯論的裁判。請根據以下辯題與完整逐字稿評分並宣告勝方。評判標準：論證品質、證據運用、對對方攻擊的回應力度；不看修辭華麗程度。

## 辯題
${motion}

## 完整逐字稿
${renderTranscript(transcript)}

## 輸出格式
只輸出一個 JSON 物件，不要其他文字：
{
  "winner": "proponent" | "opponent" | "draw",
  "proponent_score": <1-10 整數>,
  "opponent_score": <1-10 整數>,
  "reasoning": "<150 字以內的判決理由，繁體中文，指出決定性的攻防點>"
}`;
}
