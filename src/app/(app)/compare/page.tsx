"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EvidenceHover } from "@/components/evidence-popover";
import type { EvidenceItem } from "@/lib/keypoints/parse";

interface WorkspaceItem {
  id: string;
  title: string;
  hasKeypoints: boolean;
}

type CompareArrayField = "methodology" | "data_experiments" | "contributions" | "limitations" | "novelty";

interface CompareResult {
  id: string;
  paperIds: string[];
  titles?: string[];
  createdAt?: string;
  methodology: string[];
  data_experiments: string[];
  contributions: string[];
  limitations: string[];
  novelty: string[];
  verdict: string;
  evidence?: Partial<Record<CompareArrayField, EvidenceItem[][]>>;
}

const ROWS: { key: CompareArrayField; label: string }[] = [
  { key: "methodology", label: "研究方法" },
  { key: "data_experiments", label: "資料與實驗" },
  { key: "contributions", label: "主要貢獻" },
  { key: "limitations", label: "侷限性" },
  { key: "novelty", label: "新穎度" },
];

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <CompareInner />
    </Suspense>
  );
}

function CompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const historyId = searchParams.get("id");
  const presetIds = searchParams.get("ids");

  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    presetIds ? presetIds.split(",").filter(Boolean).slice(0, 6) : []
  );
  const [status, setStatus] = useState<"idle" | "loading" | "comparing" | "done" | "failed">(() =>
    historyId ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // searchParams 變化時在 render 期間同步調整狀態（React 官方建議模式，避免 effect 內 setState）
  const [prevQuery, setPrevQuery] = useState({ historyId, presetIds });
  if (prevQuery.historyId !== historyId || prevQuery.presetIds !== presetIds) {
    setPrevQuery({ historyId, presetIds });
    if (presetIds) setSelected(presetIds.split(",").filter(Boolean).slice(0, 6));
    if (historyId) {
      setStatus("loading");
      setError(null);
    } else {
      setResult(null);
      if (status === "done" || status === "loading") setStatus("idle");
    }
  }

  useEffect(() => {
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => setItems(json.items));
  }, []);

  // ?id=xxx：載入歷史比較
  useEffect(() => {
    if (!historyId) return;
    let ignore = false;
    fetch(`/api/compare/${historyId}`)
      .then((res) => res.json())
      .then((json) => {
        if (ignore) return;
        if (json.error) {
          setError(json.error);
          setStatus("failed");
        } else {
          setResult(json);
          setStatus("done");
        }
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "載入失敗");
        setStatus("failed");
      });
    return () => {
      ignore = true;
    };
  }, [historyId]);

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
    setStageMsg(null);
    try {
      const res = await fetch("/api/compare/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds: selected }),
      });
      const json = await res.json();
      if (!res.ok || !json.jobId) {
        setError(json.error ?? "比較失敗");
        setStatus("failed");
        return;
      }

      // SSE 跟進度：階段訊息 + 已耗時；done 事件帶 compareId 後跳結果頁
      const startAt = Date.now();
      setElapsed(0);
      const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startAt) / 1000)), 1000);
      const es = new EventSource(`/api/jobs/${json.jobId}/events`);
      const cleanup = () => {
        clearInterval(timer);
        es.close();
      };
      es.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as { type: string; data: unknown };
        if (event.type === "stage") {
          setStageMsg((event.data as { message: string }).message);
        } else if (event.type === "done") {
          cleanup();
          const { compareId } = event.data as { compareId: string };
          window.dispatchEvent(new Event("lr:refresh"));
          router.replace(`/compare?id=${compareId}`);
        } else if (event.type === "failed") {
          cleanup();
          setError((event.data as { error: string }).error);
          setStatus("failed");
        }
      };
      es.onerror = () => {
        cleanup();
        setError("進度連線中斷，請重試");
        setStatus("failed");
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "比較失敗");
      setStatus("failed");
    }
  }

  const analyzedItems = items?.filter((item) => item.hasKeypoints) ?? [];
  const titleById = new Map((items ?? []).map((item) => [item.id, item.title]));

  function paperTitle(result: CompareResult, index: number): string {
    return result.titles?.[index] ?? titleById.get(result.paperIds[index]) ?? result.paperIds[index];
  }

  // ── 結果檢視（歷史或剛跑完） ──
  if ((status === "done" || status === "loading") && (result || status === "loading")) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-8 pb-24 pt-10">
        <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">比較結果</h1>
        {status === "loading" && <p className="mt-8 text-sm text-steel">載入中…</p>}
        {result && (
          <>
            <p className="mt-1.5 text-sm text-slate">
              {result.paperIds.length} 篇{result.createdAt ? ` · ${result.createdAt.slice(0, 10)}` : ""}
            </p>

            <div className="mt-7 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-24 border border-hairline bg-surface" />
                    {result.paperIds.map((id, i) => (
                      <th
                        key={id}
                        className="border border-hairline bg-surface px-4 py-3 text-left align-top font-serif text-sm font-semibold leading-[1.35]"
                      >
                        {paperTitle(result, i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, rowIndex) => (
                    <tr key={row.key}>
                      <td className="whitespace-nowrap border border-hairline bg-surface-soft px-4 py-3.5 align-top font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">
                        {row.label}
                      </td>
                      {result[row.key].map((cell, i) => (
                        <td
                          key={i}
                          className={`border border-hairline px-4 py-3.5 align-top text-[13px] leading-[1.65] ${
                            rowIndex % 2 === 1 ? "bg-surface-soft" : ""
                          }`}
                        >
                          <EvidenceHover
                            strategy="fixed"
                            items={result.evidence?.[row.key]?.[i]}
                            onOpenPdf={(page) => router.push(`/workspace/${result.paperIds[i]}?pdf=${page}`)}
                          >
                            {cell}
                          </EvidenceHover>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-md bg-surface px-5 py-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
                綜合結論
              </p>
              <p className="mt-2 text-sm leading-[1.7]">{result.verdict}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 選擇檢視 ──
  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">比較</h1>
      <p className="mt-1.5 text-sm text-slate">勾選 2–6 篇已完成「找重點」的論文進行比較。</p>

      {items && analyzedItems.length === 0 && (
        <p className="mt-8 text-sm text-steel">尚未有已分析的論文，先到工作區對論文按「找重點」。</p>
      )}

      {analyzedItems.length > 0 && (
        <ul className="mt-7 divide-y divide-hairline border-t border-hairline">
          {analyzedItems.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-3 py-3.5">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  disabled={!selected.includes(item.id) && selected.length >= 6}
                  className="h-[15px] w-[15px] shrink-0 accent-primary"
                />
                <span className="font-serif text-[15px] font-semibold leading-[1.35]">
                  {item.title || "（無標題）"}
                </span>
              </label>
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
            className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
          >
            {status === "comparing" ? "比較中…" : "比較"}
          </button>
          <span className="text-xs text-steel">
            已選 {selected.length} / 6 篇（最少 2 篇）
          </span>
        </div>
      )}

      {status === "comparing" && (
        <div className="mt-5 flex items-center gap-2.5 text-sm text-slate">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          {stageMsg ?? "排隊中…"}
          <span className="font-mono text-[11px] text-steel">已耗時 {elapsed}s</span>
        </div>
      )}

      {status === "failed" && <p className="mt-6 text-sm text-error">比較失敗：{error}</p>}
    </div>
  );
}
