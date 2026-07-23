import * as cheerio from "cheerio";

// 兩個 HTML 來源都是 LaTeXML 生成、結構相同（ltx_document）：
// arxiv.org/html 對新論文上線即有（ar5iv 轉檔會落後數月），故優先；
// 舊論文 arxiv.org/html 可能 404，退回 ar5iv 補洞。
const HTML_SOURCES = [
  (id: string) => `https://arxiv.org/html/${id}`,
  (id: string) => `https://ar5iv.org/abs/${id}`,
];
const USER_AGENT = "litereview/1.0";

/** 抓 arXiv 原生 HTML（fallback: ar5iv），轉成給 LLM 看的 plain text。 */
export async function fetchArxivFullText(arxivId: string): Promise<string> {
  let lastError: unknown = null;
  for (const buildUrl of HTML_SOURCES) {
    try {
      return await fetchAndParseArxivHtml(buildUrl(arxivId));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("arXiv HTML 擷取失敗");
}

async function fetchAndParseArxivHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`arXiv HTML 擷取失敗: ${res.status}（${url}）`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const article = $("article.ltx_document, article").first();
  if (article.length === 0) throw new Error("arXiv HTML: 找不到論文內容");

  // 數學式優先用 MathML 內附的原始 LaTeX annotation 取代，保留可讀性
  article.find("math").each((_, el) => {
    const $el = $(el);
    const latex = $el.find('annotation[encoding="application/x-tex"]').first().text().trim();
    if (latex) $el.replaceWith(` $${latex}$ `);
  });

  article.find("figure, .ltx_bibliography, script, style").remove();

  const parts: string[] = [];
  article.find("h1, h2, h3, h4, p, li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  });

  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("arXiv HTML: 擷取內容為空");
  return text;
}
