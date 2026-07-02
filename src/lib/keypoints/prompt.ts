export function buildKeypointsPrompt(
  paper: { title: string; abstract: string },
  fullText: string,
  isAbstractOnly: boolean
): string {
  const scopeNote = isAbstractOnly
    ? "注意：以下只有論文標題與摘要，沒有全文，請盡力根據摘要推論，若資訊不足請誠實填寫「摘要未提供足夠資訊」。"
    : "以下是論文全文（或主要內容）。";

  return `你是一位嚴謹的學術論文分析助理。請閱讀以下論文內容，並輸出結構化重點分析。

論文標題：${paper.title}
摘要：${paper.abstract}

${scopeNote}

全文內容：
"""
${fullText.slice(0, 60000)}
"""

請只輸出一個 JSON 物件（不要加任何說明文字，也不要用 markdown code fence 包住），欄位如下，除了 novelty_rating 外全部使用繁體中文：

{
  "research_question": "這篇論文要解決的研究問題",
  "methodology": "研究方法／技術方案摘要",
  "key_findings": "主要研究發現",
  "data_experiments": "使用的資料集與實驗設計摘要",
  "contributions": "主要貢獻",
  "limitations": "侷限性與未來工作方向",
  "novelty_rating": "High 或 Medium 或 Low",
  "novelty_reason": "評定新穎度的理由",
  "key_formulas_or_algorithms": ["關鍵公式或演算法（字串陣列，沒有就回傳空陣列）"]
}`;
}
