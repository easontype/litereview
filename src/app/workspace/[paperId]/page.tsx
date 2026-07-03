"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
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

interface ReviewScore {
  score: number;
  reason: string;
}

interface ReviewData {
  paperId: string;
  data: {
    scores: Record<string, ReviewScore>;
    strengths: string[];
    weaknesses: string[];
    motions: Array<{ statement: string; rationale: string }>;
  };
  seatInfo: string;
  createdAt: string;
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

const SCORE_LABEL: Record<string, string> = {
  methodological_rigor: "方法嚴謹度",
  evidence_strength: "證據強度",
  novelty: "新穎性",
  reproducibility: "可重現性",
  clarity: "寫作清晰度",
};

export default function PaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = use(params);
  const [tab, setTab] = useState<"keypoints" | "review">("keypoints");
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

      <div className="mt-6 flex gap-1 border-b border-hairline">
        <TabButton active={tab === "keypoints"} onClick={() => setTab("keypoints")}>
          重點
        </TabButton>
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>
          審查
        </TabButton>
      </div>

      {tab === "keypoints" && (
        <KeypointsTab
          paperId={paperId}
          paper={paper}
          keypoints={keypoints}
          status={status}
          error={error}
          onRerun={() => runAnalysis(true)}
        />
      )}
      {tab === "review" && <ReviewTab paperId={paperId} hasKeypoints={Boolean(keypoints)} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3.5 py-2 text-sm font-medium transition-colors ${
        active
          ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-primary"
          : "text-slate hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ── 重點分頁 ─────────────────────────── */

function KeypointsTab({
  paperId,
  paper,
  keypoints,
  status,
  error,
  onRerun,
}: {
  paperId: string;
  paper: WorkspaceItem | null;
  keypoints: KeypointsData | null;
  status: "loading" | "analyzing" | "done" | "failed";
  error: string | null;
  onRerun: () => void;
}) {
  return (
    <>
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
            onClick={onRerun}
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
              onClick={onRerun}
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
    </>
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

/* ── 審查分頁 ─────────────────────────── */

function scoreTone(score: number): string {
  if (score >= 8) return "bg-success";
  if (score >= 6) return "bg-primary";
  if (score >= 4) return "bg-warning";
  return "bg-error";
}

function ReviewTab({ paperId, hasKeypoints }: { paperId: string; hasKeypoints: boolean }) {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "running" | "done" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/review/${paperId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (ignore) return;
        if (json?.review) {
          setReview(json.review);
          setStatus("done");
        } else {
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!ignore) setStatus("idle");
      });
    return () => {
      ignore = true;
    };
  }, [paperId]);

  async function runReview(forceRefresh: boolean) {
    setStatus("running");
    setError(null);
    try {
      const res = await fetch(`/api/review/${paperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      const json = await res.json();
      if (json.status === "done") {
        setReview(json.review);
        setStatus("done");
      } else {
        setError(json.error ?? "審查失敗");
        setStatus("failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "審查失敗");
      setStatus("failed");
    }
  }

  if (status === "loading") return <p className="mt-8 text-sm text-steel">載入中…</p>;

  if (status === "idle" || status === "failed") {
    return (
      <div className="mt-8">
        <p className="text-sm leading-[1.7] text-slate">
          審查會以審查委員的視角給出五維評分（方法嚴謹度、證據強度、新穎性、可重現性、清晰度）、
          優缺點清單，以及可供辯論的爭點。
          {!hasKeypoints && "這篇論文還沒找過重點，執行審查時會先自動跑一次找重點。"}
        </p>
        {status === "failed" && <p className="mt-3 text-sm text-error">審查失敗：{error}</p>}
        <button
          type="button"
          onClick={() => runReview(false)}
          className="mt-4 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed"
        >
          執行審查
        </button>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="mt-8 flex items-center gap-2.5 text-sm text-slate">
        <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
        審查中，可能需要數分鐘（未找過重點的論文會先跑找重點）…
      </div>
    );
  }

  if (!review) return null;
  const dims = Object.entries(review.data.scores);
  const avg = Math.round((dims.reduce((acc, [, s]) => acc + s.score, 0) / dims.length) * 10) / 10;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] text-steel">
          {review.seatInfo} · 審查於 {review.createdAt.slice(0, 16).replace("T", " ")}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => runReview(true)}
          className="rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
        >
          重新審查
        </button>
      </div>

      {/* Scorecard */}
      <div className="mt-5 rounded-md border border-hairline bg-canvas p-5">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[36px] font-bold leading-none">{avg}</span>
          <span className="text-sm text-steel">/ 10 綜合</span>
        </div>
        <div className="mt-4 flex flex-col gap-3.5">
          {dims.map(([dim, s]) => (
            <div key={dim}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{SCORE_LABEL[dim] ?? dim}</span>
                <span className="font-mono text-[12px] text-slate">{s.score}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className={`h-full rounded-full ${scoreTone(s.score)} transition-[width] duration-500`}
                  style={{ width: `${s.score * 10}%` }}
                />
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-slate">{s.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 優缺點 */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-hairline bg-canvas p-4">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-success">
            優點
          </h3>
          <ul className="mt-2 space-y-1.5">
            {review.data.strengths.map((s, i) => (
              <li key={i} className="text-[13.5px] leading-[1.6]">
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-hairline bg-canvas p-4">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-error">
            弱點
          </h3>
          <ul className="mt-2 space-y-1.5">
            {review.data.weaknesses.map((s, i) => (
              <li key={i} className="text-[13.5px] leading-[1.6]">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 爭點 */}
      <div className="mt-6">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          可辯論爭點
        </h3>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {review.data.motions.map((m, i) => (
            <div key={i} className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
              <p className="text-[14px] font-medium leading-[1.55]">{m.statement}</p>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-slate">{m.rationale}</p>
              <Link
                href={`/debate?paperId=${encodeURIComponent(paperId)}&motion=${encodeURIComponent(m.statement)}`}
                className="mt-2.5 inline-flex items-center rounded-sm bg-primary px-3 py-1.5 text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-pressed"
              >
                發起辯論
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
