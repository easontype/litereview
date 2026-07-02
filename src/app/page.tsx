"use client";

import { useState } from "react";
import type { PaperResult } from "@/lib/scholarly/types";

const SOURCE_LABEL: Record<PaperResult["source"], string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaperResult[] | null>(null);
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
    if (res.ok) setAddedKeys((prev) => new Set(prev).add(key));
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10">
      <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-tight">搜尋文獻</h1>
      <p className="mt-1.5 text-sm leading-[1.55] text-foreground/55">
        輸入關鍵字、arXiv ID 或 DOI
      </p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="transformer attention / 2301.12345 / 10.1145/..."
          className="h-11 flex-1 border border-black/15 bg-transparent px-3 text-sm outline-none placeholder:text-foreground/35 focus:border-foreground/40 dark:border-white/15"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-11 shrink-0 bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {loading ? "搜尋中…" : "搜尋"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {results && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-medium tracking-wide text-foreground/45">
            {results.length} 筆結果
          </p>
          <ul className="divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
            {results.map((paper, i) => {
              const added = addedKeys.has(paperKey(paper));
              return (
                <li key={paper.arxivId ?? paper.doi ?? `${paper.title}-${i}`} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-serif text-lg font-semibold leading-[1.2] text-foreground">
                        {paper.title || "（無標題）"}
                      </h2>
                      <p className="mt-1 text-[13px] leading-[1.55] text-foreground/55">
                        {paper.authors.slice(0, 4).join(", ")}
                        {paper.authors.length > 4 ? " 等" : ""}
                        {paper.year ? ` · ${paper.year}` : ""}
                        {paper.venue ? ` · ${paper.venue}` : ""}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/45">
                        <span className="font-mono">{SOURCE_LABEL[paper.source]}</span>
                        {paper.citationCount !== null && (
                          <span className="font-mono">被引 {paper.citationCount}</span>
                        )}
                        {paper.quality?.hIndex != null && (
                          <span className="font-mono">h-index {paper.quality.hIndex}</span>
                        )}
                        {paper.arxivId && <span className="font-mono">arXiv:{paper.arxivId}</span>}
                        {paper.doi && <span className="font-mono">{paper.doi}</span>}
                      </div>

                      {paper.abstract && (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-[1.7] text-foreground/70">
                          {paper.abstract}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAdd(paper)}
                      disabled={added}
                      className="h-8 shrink-0 self-start border border-black/15 px-3 text-xs font-medium transition-colors hover:border-foreground/40 disabled:opacity-40 dark:border-white/15"
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
