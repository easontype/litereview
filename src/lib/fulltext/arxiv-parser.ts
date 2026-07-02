import * as cheerio from "cheerio";

const AR5IV_BASE = "https://ar5iv.org/abs";
const USER_AGENT = "litereview/1.0";

/** 抓 ar5iv 的 HTML（LaTeX 已轉 HTML5+MathML），轉成給 LLM 看的 plain text。 */
export async function fetchArxivFullText(arxivId: string): Promise<string> {
  const res = await fetch(`${AR5IV_BASE}/${arxivId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`ar5iv 擷取失敗: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const article = $("article.ltx_document, article").first();
  if (article.length === 0) throw new Error("ar5iv: 找不到論文內容");

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
  if (!text) throw new Error("ar5iv: 擷取內容為空");
  return text;
}
