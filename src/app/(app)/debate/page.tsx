"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface WorkspaceItem {
  id: string;
  title: string;
  hasKeypoints: boolean;
  arxivId: string | null;
  doi: string | null;
}

interface DebateListItem {
  id: string;
  motion: string;
  titles: string[];
  status: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  running: { label: "進行中", cls: "bg-primary-tint text-primary" },
  done: { label: "已判決", cls: "bg-success/10 text-success" },
  failed: { label: "失敗", cls: "bg-error/10 text-error" },
};

export default function DebatePage() {
  return (
    <Suspense fallback={null}>
      <DebateInner />
    </Suspense>
  );
}

function DebateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPaperId = searchParams.get("paperId");
  const presetMotion = searchParams.get("motion");

  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [debates, setDebates] = useState<DebateListItem[] | null>(null);
  const [motion, setMotion] = useState(presetMotion ?? "");
  const [selected, setSelected] = useState<string[]>(presetPaperId ? [presetPaperId] : []);
  const [rounds, setRounds] = useState<1 | 2>(1);
  const [judges, setJudges] = useState<1 | 3>(3);
  const [useExternalEvidence, setUseExternalEvidence] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => setItems(json.items));
    fetch("/api/debate")
      .then((res) => res.json())
      .then((json) => setDebates(json.debates));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function startDebate() {
    setStatus("starting");
    setError(null);
    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motion,
          paperIds: selected,
          rounds,
          judges,
          useExternalEvidence: useExternalEvidence && !externalDisabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "發起辯論失敗");
        setStatus("failed");
        return;
      }
      window.dispatchEvent(new Event("lr:refresh"));
      router.push(`/debate/${json.debateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "發起辯論失敗");
      setStatus("failed");
    }
  }

  const canStart = motion.trim().length > 0 && selected.length >= 1 && selected.length <= 3;

  // 外部證據庫走 OpenAlex 引文圖譜：任一所選論文無 DOI/arXiv ID 就無法檢索，停用勾選
  const papersWithoutId = (items ?? []).filter(
    (item) => selected.includes(item.id) && !item.doi && !item.arxivId
  );
  const externalDisabled = selected.length === 0 || papersWithoutId.length > 0;

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">辯論</h1>
      <p className="mt-1.5 text-sm text-slate">
        給定一個爭點，讓正反方模型針對論文證據多輪攻防，最後由裁判模型判決。座位模型可在設定中心調配。
      </p>

      {/* ── 辯題 ── */}
      <div className="mt-8">
        <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          辯題
        </label>
        <textarea
          value={motion}
          onChange={(e) => setMotion(e.target.value)}
          rows={3}
          placeholder="例：本文方法的效能提升主要來自資料規模而非架構創新"
          className="mt-2 w-full resize-y rounded-md border border-hairline bg-canvas px-4 py-3 text-sm leading-[1.65] outline-none transition-colors focus:border-hairline-strong"
        />
        <p className="mt-1 text-xs text-steel">提示：論文審查籤的「爭點」卡片可一鍵帶入辯題。</p>
      </div>

      {/* ── 論文選擇 ── */}
      <div className="mt-7">
        <label className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          論文（1–3 篇）
        </label>
        {items && items.length === 0 && (
          <p className="mt-3 text-sm text-steel">工作區還沒有論文——先上傳 PDF 或從 Zotero 匯入。</p>
        )}
        {items && items.length > 0 && (
          <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    disabled={!selected.includes(item.id) && selected.length >= 3}
                    className="h-[15px] w-[15px] shrink-0 accent-primary"
                  />
                  <span className="font-serif text-[15px] font-semibold leading-[1.35]">
                    {item.title || "（無標題）"}
                  </span>
                  {!item.hasKeypoints && (
                    <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-steel">
                      未分析
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 外部證據庫 ── */}
      <div className="mt-6 rounded-md border border-hairline bg-surface px-4 py-3">
        <label className={`flex items-start gap-3 ${externalDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            data-testid="external-evidence-toggle"
            checked={useExternalEvidence && !externalDisabled}
            onChange={(e) => setUseExternalEvidence(e.target.checked)}
            disabled={externalDisabled}
            className="mt-0.5 h-[15px] w-[15px] shrink-0 accent-primary disabled:cursor-not-allowed"
          />
          <span>
            <span className={`text-sm font-medium ${externalDisabled ? "text-steel" : ""}`}>
              外部證據庫
            </span>
            <span className="mt-0.5 block text-xs leading-[1.6] text-steel">
              從被辯論文的引文圖譜（OpenAlex）檢索文獻，只留 Q1/Q2 期刊或 CORE A*/A 會議，
              經相關性過濾後編成 6–8 張證據卡供正反方與裁判引用。建庫約需 20–40 秒。
            </span>
            {papersWithoutId.length > 0 && (
              <span className="mt-1 block text-xs text-warning" data-testid="external-evidence-reason">
                「{papersWithoutId[0].title || "（無標題）"}」無 DOI/arXiv ID，無法檢索引文圖譜。
              </span>
            )}
          </span>
        </label>
      </div>

      {/* ── 駁論輪數 + 開始 ── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startDebate}
          disabled={!canStart || status === "starting"}
          className="rounded-sm bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
        >
          {status === "starting" ? "開場中…" : "開始辯論"}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate">
          駁論輪數
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value) === 2 ? 2 : 1)}
            className="rounded-sm border border-hairline bg-canvas px-2 py-1 text-xs outline-none"
          >
            <option value={1}>1 輪</option>
            <option value={2}>2 輪</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate">
          裁判團
          <select
            value={judges}
            onChange={(e) => setJudges(Number(e.target.value) === 1 ? 1 : 3)}
            className="rounded-sm border border-hairline bg-canvas px-2 py-1 text-xs outline-none"
          >
            <option value={3}>三裁判合議</option>
            <option value={1}>單裁判</option>
          </select>
        </label>
        <span className="text-xs text-steel">
          已選 {selected.length} / 3 篇 · 未分析的論文會先自動跑「找重點」
        </span>
      </div>

      {status === "failed" && <p className="mt-4 text-sm text-error">發起失敗：{error}</p>}

      {/* ── 歷史辯論 ── */}
      {debates && debates.length > 0 && (
        <div className="mt-12">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
            歷史辯論
          </h2>
          <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
            {debates.map((d) => {
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.failed;
              return (
                <li key={d.id}>
                  <Link href={`/debate/${d.id}`} className="group block py-3.5">
                    <div className="flex items-start gap-3">
                      <p className="font-serif text-[15px] font-semibold leading-[1.4] group-hover:text-primary">
                        {d.motion}
                      </p>
                      <span
                        className={`ml-auto mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-steel">
                      {d.titles.join("、")} · {d.createdAt.slice(0, 10)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
