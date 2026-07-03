import type { KeypointsRow, PaperRow } from "@/lib/db";

const SOURCE_LABEL: Record<string, string> = {
  arxiv: "arXiv 全文",
  upload: "上傳 PDF",
  unpaywall: "Unpaywall PDF",
  abstract_only: "僅摘要分析（可信度較低）",
};

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function section(label: string, value: string): string {
  if (!value.trim()) return "";
  return `<h2>${esc(label)}</h2>\n<p>${esc(value)}</p>\n`;
}

/** 九欄位 keypoints → Zotero 子筆記 HTML（Zotero 筆記編輯器支援基本 HTML 標籤）。 */
export function buildNoteHtml(paper: PaperRow, keypoints: KeypointsRow): string {
  const date = keypoints.analyzedAt.slice(0, 16).replace("T", " ");
  const source = SOURCE_LABEL[keypoints.fulltextSource] ?? keypoints.fulltextSource;

  let html = `<h1>litereview 重點分析</h1>\n`;
  html += `<p><em>分析於 ${esc(date)} · 全文來源：${esc(source)}</em></p>\n`;
  html += section("研究問題", keypoints.researchQuestion);
  html += section("研究方法", keypoints.methodology);
  html += section("主要發現", keypoints.keyFindings);
  html += section("資料與實驗", keypoints.dataExperiments);
  html += section("主要貢獻", keypoints.contributions);
  html += section("侷限性", keypoints.limitations);
  html += section("新穎度", `${keypoints.noveltyRating} — ${keypoints.noveltyReason}`);
  if (keypoints.keyFormulasOrAlgorithms.length > 0) {
    html += `<h2>關鍵公式／演算法</h2>\n`;
    for (const formula of keypoints.keyFormulasOrAlgorithms) {
      html += `<pre>${esc(formula)}</pre>\n`;
    }
  }
  html += `<p><em>由 litereview 自動產生，重新分析後可再次寫回更新。</em></p>`;
  return html;
}
