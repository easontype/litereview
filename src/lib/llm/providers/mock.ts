import type { LlmProvider, ProviderConfig } from "@/lib/llm/types";

/**
 * 測試/展示用 provider：不呼叫任何模型，依 prompt 內的 schema 標記回傳罐頭回應。
 * 用途：e2e 測試審查/辯論全流程而不燒訂閱額度或 API 費用。
 * 判別標記與各 prompt builder 的欄位名耦合（review 的 "motions"、judge 的 "argument_quality"…），
 * 改 prompt schema 時記得同步這裡。
 */
export function createMockProvider(config: ProviderConfig): LlmProvider {
  function answer(prompt: string): string {
    if (prompt.includes('"motions"')) return mockReview();
    if (prompt.includes('"argument_quality"')) return mockVerdict();
    if (prompt.includes('"verdict"') && prompt.includes("陣列長度需等於")) {
      const m = /陣列長度需等於 (\d+)/.exec(prompt);
      return mockCompare(Number(m?.[1] ?? 2));
    }
    if (prompt.includes('"research_question"')) return mockKeypoints();
    // 【E1】【E2】對應 mock keypoints 的兩條 evidence（經辯論引文庫編號後必命中）
    return "【mock】這是模擬的辯論發言：基於論文提供的證據，我方立場成立。理由一，實驗設計涵蓋了主要變因【E1】；理由二，對照組結果一致【E2】；理由三，效應量在多個資料集上穩定。";
  }

  return {
    id: config.id,
    kind: "mock",
    label: config.label,
    async chat(prompt) {
      // 模擬一點延遲，讓 UI 的進行中狀態可被觀察/測試
      await new Promise((r) => setTimeout(r, 150));
      return answer(prompt);
    },
    chatStream(prompt) {
      // 逐字串流版：切小塊帶延遲吐出，供 e2e 驗證 token 級 SSE 流程
      return {
        async *[Symbol.asyncIterator]() {
          const full = answer(prompt);
          const step = 6;
          for (let i = 0; i < full.length; i += step) {
            await new Promise((r) => setTimeout(r, 12));
            yield full.slice(i, i + step);
          }
        },
      };
    },
    chatMessages(messages) {
      // v1.8 Chat 罐頭回應：有圖片時回不同內容，供 e2e 斷言傳圖路徑
      const hasImage = messages.some(
        (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image")
      );
      const full = hasImage
        ? "【mock】已收到圖片：這是模擬的看圖回覆。"
        : "【mock】這是模擬的對話回覆：已讀取你提供的脈絡，請繼續提問。";
      return {
        async *[Symbol.asyncIterator]() {
          const step = 6;
          for (let i = 0; i < full.length; i += step) {
            await new Promise((r) => setTimeout(r, 12));
            yield full.slice(i, i + step);
          }
        },
      };
    },
  };
}

function mockReview(): string {
  return JSON.stringify({
    scores: {
      methodological_rigor: { score: 7, reason: "【mock】方法描述完整，但缺少部分消融實驗。" },
      evidence_strength: { score: 6, reason: "【mock】主要結論有資料支撐，次要主張證據較弱。" },
      novelty: { score: 8, reason: "【mock】核心想法在該領域屬新穎組合。" },
      reproducibility: { score: 5, reason: "【mock】未附程式碼，超參數描述不完整。" },
      clarity: { score: 8, reason: "【mock】結構清楚，圖表可讀性佳。" },
    },
    strengths: ["【mock】問題定義明確", "【mock】實驗規模足夠"],
    weaknesses: ["【mock】缺少與最新基線的比較", "【mock】資料集偏單一領域"],
    motions: [
      { statement: "【mock】本文方法的效能提升主要來自資料規模而非架構創新", rationale: "消融實驗未能區分兩者貢獻" },
      { statement: "【mock】本文結論可推廣到其他領域", rationale: "僅在單一領域驗證，推廣性存疑" },
    ],
    critical_checklist: {
      research_question_clarity: { verdict: "pass", reason: "【mock】問題陳述具體且範圍清楚。" },
      design_fit: { verdict: "pass", reason: "【mock】實驗設計直接對應研究問題。" },
      sample_adequacy: { verdict: "partial", reason: "【mock】資料集規模可接受，但缺乏跨領域驗證。" },
      data_reliability: { verdict: "pass", reason: "【mock】使用公開基準資料集，標註品質有保障。" },
      limitations_acknowledged: { verdict: "fail", reason: "【mock】作者僅提及計算成本，未討論資料偏差。" },
    },
    unacknowledged_limitations: ["【mock】資料集偏單一領域造成的推廣性風險，作者未承認"],
    evidence: {
      scores: {
        methodological_rigor: [{ quote: "【mock】審查出處引文：實驗依三組對照設計進行", page: 1 }],
      },
      checklist: {
        sample_adequacy: [{ quote: "【mock】檢核出處引文：我們在單一資料集上進行實驗", page: 2 }],
      },
      strengths: [[{ quote: "【mock】優點出處引文", page: 1 }], []],
      weaknesses: [[], []],
    },
  });
}

function mockVerdict(): string {
  const entry = (p: number, o: number, label: string) => ({
    proponent: { score: p, reason: `【mock】正方${label}評語。` },
    opponent: { score: o, reason: `【mock】反方${label}評語。` },
  });
  return JSON.stringify({
    criteria: {
      argument_quality: entry(8, 6, "論點品質"),
      evidence_use: entry(7, 5, "證據運用"),
      rebuttal_strength: entry(7, 6, "反駁力度"),
      responsiveness: entry(8, 6, "回應完整度"),
    },
    reasoning: "【mock】正方立論緊扣論文證據並有效回應了反方對資料規模的質疑；反方雖指出推廣性限制，但未能提出具體反例。",
  });
}

function mockCompare(n: number): string {
  const arr = (label: string) => Array.from({ length: n }, (_, i) => `【mock】論文 ${i + 1} 的${label}摘要`);
  // 每欄每篇回 P{i}-E1：mock keypoints 的第一條 evidence（research_question, page 1），必命中索引
  const evidenceRefs = () => Array.from({ length: n }, (_, i) => [`P${i + 1}-E1`]);
  return JSON.stringify({
    methodology: arr("方法"),
    data_experiments: arr("資料與實驗"),
    contributions: arr("貢獻"),
    limitations: arr("侷限"),
    novelty: arr("新穎度"),
    verdict: "【mock】綜合比較結論：各篇各有側重，建議依研究目的選讀。",
    evidence: {
      methodology: evidenceRefs(),
      data_experiments: evidenceRefs(),
      contributions: evidenceRefs(),
      limitations: evidenceRefs(),
      novelty: evidenceRefs(),
    },
  });
}

function mockKeypoints(): string {
  return JSON.stringify({
    research_question: "【mock】研究問題",
    methodology: "【mock】研究方法",
    key_findings: "【mock】主要發現",
    data_experiments: "【mock】資料與實驗",
    contributions: "【mock】主要貢獻",
    limitations: "【mock】侷限性",
    novelty_rating: "Medium",
    novelty_reason: "【mock】新穎度理由",
    key_formulas_or_algorithms: [],
    evidence: {
      research_question: [{ quote: "【mock】出處引文：本研究旨在解決以下問題", page: 1 }],
      methodology: [{ quote: "【mock】出處引文：我們採用以下方法", page: null }],
    },
  });
}
