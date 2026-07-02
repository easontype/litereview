import type { KeypointsRow } from "@/lib/db";

export interface ComparePaperInput {
  id: string;
  title: string;
  keypoints: KeypointsRow;
}

export function buildComparePrompt(papers: ComparePaperInput[]): string {
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
新穎度：${p.keypoints.noveltyRating} — ${p.keypoints.noveltyReason}`
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
  "verdict": "綜合以上比較的整體結論與建議（一段文字，非陣列）"
}`;
}
