"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RankBadge, type RankInfo } from "@/components/rank-badge";

interface JournalHit {
  name: string;
  issn: string | null;
  type: string;
  publisher: string | null;
  worksCount: number | null;
  hIndex: number | null;
  twoYearCitedness: number | null;
  rank: RankInfo | null;
}

const TYPE_LABEL: Record<string, string> = {
  journal: "期刊",
  conference: "會議",
  repository: "典藏庫",
  "book series": "書系",
};

export default function JournalsPage() {
  return (
    <Suspense fallback={null}>
      <JournalsInner />
    </Suspense>
  );
}

function JournalsInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [hits, setHits] = useState<JournalHit[] | null>(null);
  const [rankingsLoaded, setRankingsLoaded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(raw: string) {
    const q = raw.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/journals?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "查詢失敗");
      setHits(json.hits);
      setRankingsLoaded(json.rankingsLoaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查詢失敗");
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await search(query);
  }

  // 帶 ?q= 進來（例如 ⌘K 期刊快查）時自動查一次
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !initialQ) return;
    didInit.current = true;
    void search(initialQ);
  }, [initialQ]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">期刊分級</h1>
      <p className="mt-1.5 text-sm text-slate">
        查詢期刊 SJR 分級（Q1–Q4）與會議 CORE 分級（A*–C），附 OpenAlex 品質信號
      </p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nature / NeurIPS / IEEE Transactions on…"
          className="h-10 flex-1 rounded-sm border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-10 shrink-0 rounded-sm bg-primary px-5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
        >
          {loading ? "查詢中…" : "查詢"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {hits && !rankingsLoaded && (
        <div className="mt-4 rounded-r-sm border-l-[3px] border-warning bg-warning-soft px-3.5 py-2.5 text-[13px] leading-[1.6]">
          尚未匯入分級資料，只顯示 OpenAlex 品質信號。在專案目錄執行{" "}
          <code className="rounded-xs bg-black/[0.06] px-1 py-0.5 font-mono text-[12px]">
            npm run fetch:rankings
          </code>{" "}
          並重啟後即可顯示 SJR / CORE 分級。
        </div>
      )}

      {hits && (
        <div className="mt-7">
          <p className="mb-3 text-xs text-steel">{hits.length} 筆結果</p>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {hits.map((hit, i) => (
              <li key={`${hit.issn ?? hit.name}-${i}`} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-[16px] font-semibold leading-[1.35]">{hit.name}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-steel">
                      <span>{TYPE_LABEL[hit.type] ?? hit.type}</span>
                      {hit.publisher && <span>{hit.publisher}</span>}
                      {hit.issn && <span>ISSN {hit.issn}</span>}
                      {hit.hIndex != null && <span>h-index {hit.hIndex}</span>}
                      {hit.twoYearCitedness != null && (
                        <span>2yr 平均被引 {hit.twoYearCitedness.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 self-start">
                    {hit.rank && (hit.rank.sjrQuartile || hit.rank.coreRank) ? (
                      <RankBadge rank={hit.rank} />
                    ) : (
                      <span className="font-mono text-[11px] text-steel">無分級資料</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {hits.length === 0 && <p className="mt-4 text-sm text-steel">查無結果，換個關鍵字試試。</p>}
        </div>
      )}
    </div>
  );
}
