import type { PaperResult } from "./types";

const FIELDS = "title,abstract,year,authors,externalIds,citationCount,venue,openAccessPdf";

interface SemanticScholarPaper {
  title?: string;
  abstract?: string | null;
  year?: number | null;
  authors?: { name?: string | null }[];
  externalIds?: { ArXiv?: string | null; DOI?: string | null };
  citationCount?: number | null;
  venue?: string | null;
  openAccessPdf?: { url?: string | null } | null;
}

export async function searchSemanticScholar(query: string, limit: number): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS,
  });
  const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Semantic Scholar 搜尋失敗: ${res.status}`);

  const json = (await res.json()) as { data?: SemanticScholarPaper[] };
  return (json.data ?? []).map(
    (p): PaperResult => ({
      title: p.title ?? "",
      abstract: p.abstract ?? "",
      year: p.year ?? null,
      authors: (p.authors ?? []).map((a) => a.name).filter((name): name is string => Boolean(name)),
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
