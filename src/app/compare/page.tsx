"use client";

import { useEffect, useState } from "react";

interface WorkspaceItem {
  id: string;
  title: string;
  hasKeypoints: boolean;
}

type CompareArrayField = "methodology" | "data_experiments" | "contributions" | "limitations" | "novelty";

interface CompareResult {
  id: string;
  paperIds: string[];
  methodology: string[];
  data_experiments: string[];
  contributions: string[];
  limitations: string[];
  novelty: string[];
  verdict: string;
}

const ROWS: { key: CompareArrayField; label: string }[] = [
  { key: "methodology", label: "研究方法" },
  { key: "data_experiments", label: "資料與實驗" },
  { key: "contributions", label: "主要貢獻" },
  { key: "limitations", label: "侷限性" },
  { key: "novelty", label: "新穎度" },
];

export default function ComparePage() {
  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "comparing" | "done" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => setItems(json.items));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  }

  async function runCompare() {
    setStatus("comparing");
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "比較失敗");
        setStatus("failed");
        return;
      }
      setResult(json);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "比較失敗");
      setStatus("failed");
    }
  }

  const analyzedItems = items?.filter((item) => item.hasKeypoints) ?? [];
  const titleById = new Map((items ?? []).map((item) => [item.id, item.title]));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10">
      <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-tight">比較</h1>
      <p className="mt-1.5 text-sm leading-[1.55] text-foreground/55">
        勾選 2–6 篇已完成「找重點」的論文進行比較。
      </p>

      {items && analyzedItems.length === 0 && (
        <p className="mt-8 text-sm leading-[1.7] text-foreground/45">
          尚未有已分析的論文，先到工作區對論文按「找重點」。
        </p>
      )}

      {analyzedItems.length > 0 && (
        <ul className="mt-8 divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
          {analyzedItems.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-4">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
                disabled={!selected.includes(item.id) && selected.length >= 6}
                className="h-4 w-4"
              />
              <span className="font-serif text-sm text-foreground">{item.title || "（無標題）"}</span>
            </li>
          ))}
        </ul>
      )}

      {analyzedItems.length > 0 && (
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={runCompare}
            disabled={selected.length < 2 || selected.length > 6 || status === "comparing"}
            className="h-9 border border-black/15 px-4 text-xs font-medium transition-colors hover:border-foreground/40 disabled:opacity-40 disabled:hover:border-black/15 dark:border-white/15"
          >
            {status === "comparing" ? "比較中…" : "比較"}
          </button>
          <span className="text-xs text-foreground/45">已選 {selected.length} / 6 篇（最少 2 篇）</span>
        </div>
      )}

      {status === "failed" && <p className="mt-6 text-sm text-red-600">比較失敗：{error}</p>}

      {status === "done" && result && (
        <div className="mt-10">
          <div className="overflow-x-auto border-t border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-32 py-3 pr-4"></th>
                  {result.paperIds.map((id) => (
                    <th
                      key={id}
                      className="border-b border-black/10 px-4 py-3 text-left font-serif text-sm font-semibold leading-[1.3] dark:border-white/10"
                    >
                      {titleById.get(id) ?? id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-black/10 dark:border-white/10">
                    <td className="py-4 pr-4 align-top font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      {row.label}
                    </td>
                    {result[row.key].map((cell, i) => (
                      <td key={i} className="px-4 py-4 align-top text-sm leading-[1.7] text-foreground/85">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border border-black/15 bg-black/[0.02] px-4 py-3 dark:border-white/15 dark:bg-white/[0.03]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground/40">綜合結論</p>
            <p className="mt-1.5 text-sm leading-[1.7] text-foreground/85">{result.verdict}</p>
          </div>
        </div>
      )}
    </div>
  );
}
