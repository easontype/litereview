import { NextRequest, NextResponse } from "next/server";
import { fetchArxivMeta, searchArxiv } from "@/lib/scholarly/arxiv";
import { searchOpenAlex } from "@/lib/scholarly/openalex";
import { searchSemanticScholar } from "@/lib/scholarly/semantic-scholar";
import { fetchByDoi } from "@/lib/scholarly/crossref-doi";
import type { PaperResult } from "@/lib/scholarly/types";

const ARXIV_ID_REGEX = /^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i;
const DOI_REGEX = /^10\.\d{4,9}\/\S+$/i;

function dedupe(papers: PaperResult[]): PaperResult[] {
  const seen = new Set<string>();
  const out: PaperResult[] = [];
  for (const paper of papers) {
    const key = paper.arxivId ?? paper.doi ?? paper.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(paper);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const limit = Number(searchParams.get("limit") ?? "10");

  if (!q) {
    return NextResponse.json({ error: "q 為必填" }, { status: 400 });
  }

  const arxivMatch = ARXIV_ID_REGEX.exec(q);
  if (arxivMatch) {
    const paper = await fetchArxivMeta(arxivMatch[1]);
    return NextResponse.json({ results: paper ? [paper] : [] });
  }

  if (DOI_REGEX.test(q)) {
    const paper = await fetchByDoi(q);
    return NextResponse.json({ results: paper ? [paper] : [] });
  }

  const settled = await Promise.allSettled([
    searchOpenAlex(q, limit),
    searchArxiv(q, limit),
    searchSemanticScholar(q, limit),
  ]);

  const merged = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return NextResponse.json({ results: dedupe(merged) });
}
