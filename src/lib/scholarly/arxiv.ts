import type { PaperResult } from "./types";

const ARXIV_API = "http://export.arxiv.org/api/query";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decodeEntities(m[1]).trim());
  return out;
}

function extractOne(xml: string, tag: string): string | null {
  return extractAll(xml, tag)[0] ?? null;
}

function parseEntry(entryXml: string): PaperResult {
  const idUrl = extractOne(entryXml, "id") ?? "";
  const arxivIdMatch = /abs\/([^/\s]+?)(v\d+)?$/.exec(idUrl.trim());
  const arxivId = arxivIdMatch ? arxivIdMatch[1] : null;

  const title = (extractOne(entryXml, "title") ?? "").replace(/\s+/g, " ").trim();
  const summary = (extractOne(entryXml, "summary") ?? "").replace(/\s+/g, " ").trim();
  const published = extractOne(entryXml, "published");
  const year = published ? Number(published.slice(0, 4)) : null;

  const authorBlocks = entryXml.match(/<author>[\s\S]*?<\/author>/g) ?? [];
  const authors = authorBlocks
    .map((block) => extractOne(block, "name"))
    .filter((n): n is string => Boolean(n));

  const pdfLinkMatch =
    /<link[^>]*type="application\/pdf"[^>]*href="([^"]+)"/.exec(entryXml) ??
    /<link[^>]*href="([^"]+)"[^>]*type="application\/pdf"/.exec(entryXml);
  const pdfUrl = pdfLinkMatch ? pdfLinkMatch[1] : arxivId ? `https://arxiv.org/pdf/${arxivId}` : null;

  return {
    title,
    abstract: summary,
    year,
    authors,
    arxivId,
    doi: null,
    pdfUrl,
    citationCount: null,
    source: "arxiv",
    venue: null,
    quality: null,
  };
}

export async function searchArxiv(query: string, limit: number): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: "0",
    max_results: String(limit),
  });
  const res = await fetch(`${ARXIV_API}?${params.toString()}`);
  if (!res.ok) throw new Error(`arXiv 搜尋失敗: ${res.status}`);

  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.map(parseEntry);
}

/** arXiv ID regex 命中時直接取單篇 metadata。 */
export async function fetchArxivMeta(arxivId: string): Promise<PaperResult | null> {
  const params = new URLSearchParams({ id_list: arxivId });
  const res = await fetch(`${ARXIV_API}?${params.toString()}`);
  if (!res.ok) return null;

  const xml = await res.text();
  const [entry] = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  if (!entry) return null;
  return parseEntry(entry);
}
