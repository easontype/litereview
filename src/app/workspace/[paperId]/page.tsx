"use client";

import { use, useEffect, useState } from "react";
import { ZoteroWritebackButton } from "@/components/zotero-writeback";
import { RankBadge, type RankInfo } from "@/components/rank-badge";

interface KeypointsData {
  paperId: string;
  fulltextSource: string;
  researchQuestion: string;
  methodology: string;
  keyFindings: string;
  dataExperiments: string;
  contributions: string;
  limitations: string;
  noveltyRating: string;
  noveltyReason: string;
  keyFormulasOrAlgorithms: string[];
  analyzedAt: string;
}

interface WorkspaceItem {
  id: string;
  title: string;
  source: string;
  arxivId: string | null;
  doi: string | null;
  zoteroKey: string | null;
  venue: string | null;
  rank?: RankInfo | null;
}

const SOURCE_LABEL: Record<string, string> = {
  arxiv: "arXiv 全文",
  upload: "上傳 PDF",
  unpaywall: "Unpaywall PDF",
  abstract_only: "僅摘要分析",
};

export default function KeypointsPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = use(params);
  const [keypoints, setKeypoints] = useState<KeypointsData | null>(null);
  const [paper, setPaper] = useState<WorkspaceItem | null>(null);
  const [status, setStatus] = useState<"loading" | "analyzing" | "done" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis(forceRefresh: boolean) {
    setStatus("analyzing");
    setError(null);
    try {
      const res = await fetch(`/api/keypoints/${paperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      const json = await res.json();
      if (json.status === "done") {
        setKeypoints(json.keypoints);
        setStatus("done");
        window.dispatchEvent(new Event("lr:refresh"));
      } else {
        setError(json.error ?? "分析失敗");
        setStatus("failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失敗");
      setStatus("failed");
    }
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => {
        if (ignore) return;
        const item = (json.items as WorkspaceItem[]).find((it) => it.id === paperId);
        if (item) setPaper(item);
      });
    fetch(`/api/keypoints/${paperId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (ignore) return;
        if (json?.keypoints) {
          setKeypoints(json.keypoints);
          setStatus("done");
        } else {
          runAnalysis(false);
        }
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      {paper && (
        <>
          <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">
            {paper.title || "（無標題）"}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-slate">
            <RankBadge rank={paper.rank} />
            {paper.venue && <span>{paper.venue}</span>}
            <span>
              {[paper.arxivId && `arXiv:${paper.arxivId}`, paper.doi].filter(Boolean).join(" · ")}
            </span>
          </p>
        </>
      )}

      {status === "loading" && <p className="mt-8 text-sm text-steel">載入中…</p>}

      {status === "analyzing" && (
        <div className="mt-8 flex items-center gap-2.5 text-sm text-slate">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          分析中，全文擷取＋LLM 分析可能需要數分鐘，請稍候…
        </div>
      )}

      {status === "failed" && (
        <div className="mt-8">
          <p className="text-sm text-error">分析失敗：{error}</p>
          <button
            type="button"
            onClick={() => runAnalysis(true)}
            className="mt-3 rounded-sm border border-hairline-strong px-4 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
          >
            重試
          </button>
        </div>
      )}

      {status === "done" && keypoints && (
        <div className="mt-4">
          {keypoints.fulltextSource === "abstract_only" && (
            <div className="mb-5 rounded-r-sm border-l-[3px] border-warning bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-[1.6]">
              僅摘要分析：找不到論文全文，以下結果僅根據摘要推論，可信度較低。
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center rounded-xs border border-hairline bg-surface-soft px-2 py-0.5 font-mono text-[11px] text-slate">
              {SOURCE_LABEL[keypoints.fulltextSource] ?? keypoints.fulltextSource}
            </span>
            <span className="font-mono text-[11px] text-steel">
              分析於 {keypoints.analyzedAt.slice(0, 16).replace("T", " ")}
            </span>
            <span className="flex-1" />
            {paper?.zoteroKey && <ZoteroWritebackButton paperId={paperId} />}
            <button
              type="button"
              onClick={() => runAnalysis(true)}
              className="rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
            >
              重新分析
            </button>
          </div>

          <dl className="mt-6 divide-y divide-hairline border-t border-hairline">
            <Field label="研究問題" value={keypoints.researchQuestion} />
            <Field label="研究方法" value={keypoints.methodology} />
            <Field label="主要發現" value={keypoints.keyFindings} />
            <Field label="資料與實驗" value={keypoints.dataExperiments} />
            <Field label="主要貢獻" value={keypoints.contributions} />
            <Field label="侷限性" value={keypoints.limitations} />
            <Field label="新穎度" value={`${keypoints.noveltyRating} — ${keypoints.noveltyReason}`} />
            {keypoints.keyFormulasOrAlgorithms.length > 0 && (
              <div className="py-5">
                <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
                  關鍵公式／演算法
                </dt>
                <dd className="mt-2 space-y-2">
                  {keypoints.keyFormulasOrAlgorithms.map((formula, i) => (
                    <div
                      key={i}
                      className="overflow-x-auto rounded-sm bg-surface px-3.5 py-2.5 font-mono text-[13px] leading-[1.8]"
                    >
                      {formula}
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-5">
      <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">{label}</dt>
      <dd className="mt-1.5 text-[15px] leading-[1.7]">{value}</dd>
    </div>
  );
}
