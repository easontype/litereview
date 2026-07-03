import { NextRequest, NextResponse } from "next/server";
import { addToWorkspace, setZoteroKey, upsertPaper } from "@/lib/db";
import { fetchByDoi } from "@/lib/scholarly/crossref-doi";
import type { ZoteroImportItem } from "@/lib/zotero/local-api";
import type { PaperResult } from "@/lib/scholarly/types";

/** Zotero 條目缺摘要且有 DOI 時，用 OpenAlex DOI lookup 補 metadata（摘要/引用數/PDF）。 */
async function toPaperResult(item: ZoteroImportItem): Promise<PaperResult> {
  let enriched: PaperResult | null = null;
  if (item.doi && !item.abstract) {
    enriched = await fetchByDoi(item.doi).catch(() => null);
  }
  return {
    title: item.title || enriched?.title || "（無標題）",
    abstract: item.abstract || enriched?.abstract || "",
    year: item.year ?? enriched?.year ?? null,
    authors: item.authors.length > 0 ? item.authors : enriched?.authors ?? [],
    arxivId: item.arxivId ?? enriched?.arxivId ?? null,
    doi: item.doi ?? enriched?.doi ?? null,
    pdfUrl: enriched?.pdfUrl ?? null,
    citationCount: enriched?.citationCount ?? null,
    source: "zotero",
    venue: item.venue ?? enriched?.venue ?? null,
    issn: item.issn ?? enriched?.issn ?? null,
    quality: enriched?.quality ?? null,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items = body?.items as ZoteroImportItem[] | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items 為必填" }, { status: 400 });
  }

  const imported: string[] = [];
  const failed: string[] = [];
  for (const item of items) {
    try {
      const paper = await toPaperResult(item);
      const id = upsertPaper(paper);
      addToWorkspace(id);
      if (item.zoteroKey) setZoteroKey(id, item.zoteroKey);
      imported.push(id);
    } catch {
      failed.push(item.title || item.zoteroKey);
    }
  }
  return NextResponse.json({ imported: imported.length, failed, ids: imported });
}
