import type { PaperResult } from "./types";

const FIELDS = "title,abstract,year,authors,externalIds,citationCount,venue,openAccessPdf";

export async function searchSemanticScholar(query: string, limit: number): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS,
  });
  const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Semantic Scholar 搜尋失敗: ${res.status}`);

  const json = await res.json();
  return (json.data ?? []).map(
    (p: any): PaperResult => ({
      title: p.title ?? "",
      abstract: p.abstract ?? "",
      year: p.year ?? null,
      authors: (p.authors ?? []).map((a: any) => a.name).filter(Boolean),
      arxivId: p.externalIds?.ArXiv ?? null,
      doi: p.externalIds?.DOI ?? null,
      pdfUrl: p.openAccessPdf?.url ?? null,
      citationCount: p.citationCount ?? null,
      source: "semantic_scholar",
      venue: p.venue ?? null,
      quality: null,
    })
  );
}
