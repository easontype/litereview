import type { KeypointsRow } from "@/lib/db";
import { EVIDENCE_FIELD_LABEL, type EvidenceItem } from "@/lib/keypoints/parse";

export interface ComparePaperInput {
  id: string;
  title: string;
  keypoints: KeypointsRow;
}

/** 引文清單的截取上限：每欄最多 2 條、每篇最多 10 條、quote 截 150 字（防 prompt 過長）。 */
const EVIDENCE_MAX_PER_FIELD = 2;
const EVIDENCE_MAX_PER_PAPER = 10;
const EVIDENCE_QUOTE_MAX_CHARS = 150;

export interface CompareEvidenceIndex {
  /** 各論文的「可引用出處」清單文字，順序同論文；該篇沒有出處資料時為 null。 */
  sections: Array<string | null>;
  /** "P1-E1" → 引文，parse 時把 LLM 回的編號映射回 EvidenceItem（編號邏輯的單一來源）。 */
  refs: Map<string, EvidenceItem>;
}

/** 把各論文既有的 keypoints 出處引文編成 P{篇}-E{序} 清單，讓比較 LLM 用編號回引。 */
export function buildCompareEvidenceIndex(papers: ComparePaperInput[]): CompareEvidenceIndex {
  const refs = new Map<string, EvidenceItem>();
  const sections = papers.map((p, paperIdx) => {
    const evidence = p.keypoints.evidence;
    if (!evidence) return null;
    const orderedFields = [
      ...Object.keys(EVIDENCE_FIELD_LABEL).filter((f) => f in evidence),
      ...Object.keys(evidence).filter((f) => !(f in EVIDENCE_FIELD_LABEL)),
    ];
    const lines: string[] = [];
    let seq = 0;
    for (const field of orderedFields) {
      if (lines.length >= EVIDENCE_MAX_PER_PAPER) break;
      for (const item of (evidence[field] ?? []).slice(0, EVIDENCE_MAX_PER_FIELD)) {
        if (lines.length >= EVIDENCE_MAX_PER_PAPER) break;
        seq += 1;
        const label = `P${paperIdx + 1}-E${seq}`;
        const quote = item.quote.slice(0, EVIDENCE_QUOTE_MAX_CHARS);
        refs.set(label, { quote, page: item.page });
        const fieldLabel = EVIDENCE_FIELD_LABEL[field] ?? field;
        const pagePart = item.page !== null ? `・第 ${item.page} 頁` : "";
        lines.push(`- ${label}（${fieldLabel}${pagePart}）：「${quote}」`);
      }
    }
    return lines.length ? lines.join("\n") : null;
  });
  return { sections, refs };
}

export function buildComparePrompt(papers: ComparePaperInput[]): string {
  const { sections } = buildCompareEvidenceIndex(papers);
  const paperBlocks = papers
    .map(
      (p, i) => `
【論文 ${i + 1}】${p.title}
研究問題：${p.keypoints.researchQuestion}
研究方法：${p.keypoints.methodology}
主要發現：${p.keypoints.keyFindings}
資料與實驗：${p.keypoints.dataExperiments}
主要貢獻：${p.keypoints.contributions}
侷限性：${p.keypoints.limitations}
新穎度：${p.keypoints.noveltyRating} — ${p.keypoints.noveltyReason}
可引用出處：${sections[i] ? `\n${sections[i]}` : "（此篇無出處資料，evidence 對應位置一律填空陣列 []）"}`
    )
    .join("\n");

  return `你是一位嚴謹的學術文獻比較助理。以下是 ${papers.length} 篇論文的重點分析，請逐篇比較後輸出結構化比較結果。
${paperBlocks}

請只輸出一個 JSON 物件（不要加任何說明文字，也不要用 markdown code fence 包住），欄位如下，全部使用繁體中文：

{
  "methodology": ["逐篇的研究方法比較摘要，陣列長度需等於 ${papers.length}，順序需與上方論文順序一致"],
  "data_experiments": ["逐篇的資料與實驗比較摘要，陣列長度與順序同上"],
  "contributions": ["逐篇的主要貢獻比較摘要，陣列長度與順序同上"],
  "limitations": ["逐篇的侷限性比較摘要，陣列長度與順序同上"],
  "novelty": ["逐篇的新穎度比較摘要，陣列長度與順序同上"],
  "verdict": "綜合以上比較的整體結論與建議（一段文字，非陣列）",
  "evidence": { "methodology": [["P1-E1"], ["P2-E3"]], "data_experiments": [[], []], "contributions": [[], []], "limitations": [[], []], "novelty": [[], []] }
}

evidence 規則：五個欄位各自是「每篇一格」的巢狀陣列，外層長度與順序同上；每格放 0–2 個最能支撐該格摘要的出處編號，只能使用各論文「可引用出處」清單中實際存在的編號，沒有合適引文就放空陣列 []。`;
}
