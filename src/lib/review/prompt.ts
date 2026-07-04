import type { KeypointsRow } from "@/lib/db";
import { hasPageMarkers } from "@/lib/fulltext";

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

  const sliced = fullText.slice(0, 60000);
  const withMarkers = !isAbstractOnly && hasPageMarkers(sliced);

  const evidenceField = isAbstractOnly
    ? ""
    : `,
  "evidence": {
    "scores": {
      "methodological_rigor": [{ "quote": "從全文原樣逐字抄錄、支撐該評分的一段話（200 字以內）", "page": ${withMarkers ? "所在頁碼" : "null"} }],
      "evidence_strength": [], "novelty": [], "reproducibility": [], "clarity": []
    },
    "strengths": [[], []],
    "weaknesses": [[], []]
  }`;

  const evidenceRules = isAbstractOnly
    ? ""
    : `
evidence 規則：
- scores 每個維度給 1–2 條出處；strengths / weaknesses 是「陣列的陣列」，長度與上方 strengths / weaknesses 相同、依序對應，某條沒有出處就放空陣列。
- quote 必須逐字出自全文，不可改寫或翻譯。
- ${
        withMarkers
          ? "page 填 quote 所在段落前方最近的「【第 N 頁】」標記中的 N（整數）；quote 本身不得包含頁碼標記。"
          : "全文沒有頁碼標記，page 一律填 null。"
      }
- 其他欄位的內容不要出現「【第 N 頁】」字樣。
`;

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
${sliced}
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
  ]${evidenceField}
}
${evidenceRules}
motions 請給 2–4 條，聚焦在：結論是否過度延伸、方法選擇是否最優、效能提升的真正來源、可推廣性等實質爭議，避免空泛命題。`;
}
