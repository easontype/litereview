import type { KeypointsRow } from "@/lib/db";

/**
 * 審查 prompt：每篇論文的品質閘門。輸入 keypoints + 全文（截斷上限與找重點一致），
 * 輸出五維 scorecard + 優缺點 + 可辯論爭點（motions，餵給 v1.2 辯論引擎）。
 */
export function buildReviewPrompt(
  paper: { title: string; abstract: string },
  keypoints: KeypointsRow,
  fullText: string,
  isAbstractOnly: boolean
): string {
  const scopeNote = isAbstractOnly
    ? "注意：只有標題與摘要可用，沒有全文；評分時請保守，並在理由中註明證據不足之處。"
    : "以下提供論文全文（或主要內容）與先前的重點分析。";

  return `你是一位資深的學術審查委員（peer reviewer），以嚴格但公允的標準審查以下論文。

論文標題：${paper.title}
摘要：${paper.abstract}

先前的重點分析（供快速掌握，仍以全文為準）：
- 研究問題：${keypoints.researchQuestion}
- 研究方法：${keypoints.methodology}
- 主要發現：${keypoints.keyFindings}
- 侷限性：${keypoints.limitations}

${scopeNote}

全文內容：
"""
${fullText.slice(0, 60000)}
"""

請只輸出一個 JSON 物件（不要加任何說明文字，也不要用 markdown code fence 包住），全部使用繁體中文：

{
  "scores": {
    "methodological_rigor": { "score": 1到10的整數, "reason": "評分理由" },
    "evidence_strength": { "score": 1到10的整數, "reason": "評分理由" },
    "novelty": { "score": 1到10的整數, "reason": "評分理由" },
    "reproducibility": { "score": 1到10的整數, "reason": "評分理由" },
    "clarity": { "score": 1到10的整數, "reason": "評分理由" }
  },
  "strengths": ["論文的主要優點，2–4 條"],
  "weaknesses": ["論文的主要弱點，2–4 條"],
  "motions": [
    { "statement": "一條值得辯論的具體爭點命題（可被支持也可被反駁的完整敘述句）", "rationale": "為什麼這是爭點" }
  ]
}

motions 請給 2–4 條，聚焦在：結論是否過度延伸、方法選擇是否最優、效能提升的真正來源、可推廣性等實質爭議，避免空泛命題。`;
}
