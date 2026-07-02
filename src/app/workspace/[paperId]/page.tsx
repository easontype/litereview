"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

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

const SOURCE_LABEL: Record<string, string> = {
  arxiv: "arXiv 全文",
  upload: "上傳 PDF",
  unpaywall: "Unpaywall PDF",
  abstract_only: "僅摘要分析",
};

export default function KeypointsPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = use(params);
  const [keypoints, setKeypoints] = useState<KeypointsData | null>(null);
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10">
      <Link href="/workspace" className="text-xs text-foreground/45 hover:text-foreground/70">
        ← 回工作區
      </Link>

      {status === "loading" && <p className="mt-8 text-sm text-foreground/45">載入中…</p>}

      {status === "analyzing" && (
        <p className="mt-8 text-sm text-foreground/55">分析中，全文擷取＋LLM 分析可能需要數分鐘，請稍候…</p>
      )}

      {status === "failed" && (
        <div className="mt-8">
          <p className="text-sm text-red-600">分析失敗：{error}</p>
          <button
            type="button"
            onClick={() => runAnalysis(true)}
            className="mt-3 h-9 border border-black/15 px-4 text-xs font-medium transition-colors hover:border-foreground/40 dark:border-white/15"
          >
            重試
          </button>
        </div>
      )}

      {status === "done" && keypoints && (
        <div className="mt-6">
          {keypoints.fulltextSource === "abstract_only" && (
            <div className="mb-6 border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm leading-[1.6] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              僅摘要分析：找不到論文全文，以下結果僅根據摘要推論，可信度較低。
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-foreground/45">
              {SOURCE_LABEL[keypoints.fulltextSource] ?? keypoints.fulltextSource}
            </span>
            <button
              type="button"
              onClick={() => runAnalysis(true)}
              className="h-8 border border-black/15 px-3 text-xs font-medium transition-colors hover:border-foreground/40 dark:border-white/15"
            >
              重新分析
            </button>
          </div>

          <dl className="mt-6 divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
            <Field label="研究問題" value={keypoints.researchQuestion} />
            <Field label="研究方法" value={keypoints.methodology} />
            <Field label="主要發現" value={keypoints.keyFindings} />
            <Field label="資料與實驗" value={keypoints.dataExperiments} />
            <Field label="主要貢獻" value={keypoints.contributions} />
            <Field label="侷限性" value={keypoints.limitations} />
            <Field label="新穎度" value={`${keypoints.noveltyRating} — ${keypoints.noveltyReason}`} />
            {keypoints.keyFormulasOrAlgorithms.length > 0 && (
              <Field label="關鍵公式／演算法" value={keypoints.keyFormulasOrAlgorithms.join("；")} />
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
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground/40">{label}</dt>
      <dd className="mt-1.5 text-sm leading-[1.7] text-foreground/85">{value}</dd>
    </div>
  );
}
