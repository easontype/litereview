"use client";

import { useState } from "react";
import type { PaperResult } from "@/lib/scholarly/types";
import { RankBadge, type RankInfo } from "@/components/rank-badge";

type SearchResult = PaperResult & { rank?: RankInfo | null };

const SOURCE_LABEL: Record<PaperResult["source"], string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  zotero: "Zotero",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  function paperKey(paper: PaperResult): string {
    return paper.arxivId ?? paper.doi ?? paper.title;
  }

  async function handleAdd(paper: PaperResult) {
    const key = paperKey(paper);
    const res = await fetch("/api/workspace/papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper }),
    });
    if (res.ok) {
      setAddedKeys((prev) => new Set(prev).add(key));
      window.dispatchEvent(new Event("lr:refresh"));
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "搜尋失敗");
      setResults(json.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">搜尋文獻</h1>
      <p className="mt-1.5 text-sm text-slate">輸入關鍵字、arXiv ID 或 DOI，多來源合併去重</p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="transformer attention / 2301.12345 / 10.1145/..."
          className="h-10 flex-1 rounded-sm border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-10 shrink-0 rounded-sm bg-primary px-5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
        >
          {loading ? "搜尋中…" : "搜尋"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {results && (
        <div className="mt-7">
          <p className="mb-3 text-xs text-steel">{results.length} 筆結果</p>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {results.map((paper, i) => {
              const added = addedKeys.has(paperKey(paper));
              return (
                <li key={paper.arxivId ?? paper.doi ?? `${paper.title}-${i}`} className="py-[18px]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-serif text-[17px] font-semibold leading-[1.3]">
                        {paper.title || "（無標題）"}
                      </h2>
                      <p className="mt-1 text-[13px] text-slate">
                        {paper.authors.slice(0, 4).join(", ")}
                        {paper.authors.length > 4 ? " 等" : ""}
                        {paper.year ? ` · ${paper.year}` : ""}
                        {paper.venue ? ` · ${paper.venue}` : ""}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-steel">
                        <RankBadge rank={paper.rank} />
                        <span>{SOURCE_LABEL[paper.source]}</span>
                        {paper.citationCount !== null && <span>被引 {paper.citationCount}</span>}
                        {paper.quality?.hIndex != null && <span>h-index {paper.quality.hIndex}</span>}
                        {paper.arxivId && <span>arXiv:{paper.arxivId}</span>}
                        {paper.doi && <span>{paper.doi}</span>}
                      </div>

                      {paper.abstract && (
                        <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.6] text-slate">
                          {paper.abstract}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAdd(paper)}
                      disabled={added}
                      className="shrink-0 self-start rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate disabled:cursor-default disabled:opacity-45 disabled:hover:border-hairline-strong"
                    >
                      {added ? "已加入" : "加入工作區"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
