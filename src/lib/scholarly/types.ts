export interface PaperResult {
  title: string;
  abstract: string;
  year: number | null;
  authors: string[];
  arxivId: string | null;
  doi: string | null;
  pdfUrl: string | null;
  citationCount: number | null;
  source: "openalex" | "semantic_scholar" | "arxiv" | "zotero";
  venue?: string | null;
  issn?: string | null;
  quality?: { twoYearCitedness: number | null; hIndex: number | null } | null;
}
