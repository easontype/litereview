"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ZoteroWritebackButton } from "@/components/zotero-writeback";
import { RankBadge, type RankInfo } from "@/components/rank-badge";
import { EvidenceHover } from "@/components/evidence-popover";
import { PdfPanel } from "@/components/pdf-panel";
import type { EvidenceItem } from "@/lib/keypoints/parse";

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
  evidence?: Record<string, EvidenceItem[]>;
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
    evidence?: {
      scores?: Record<string, EvidenceItem[]>;
      strengths?: EvidenceItem[][];
      weaknesses?: EvidenceItem[][];
    };
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
  hasPdf?: boolean;
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
  /** false＝面板關閉；number|null＝開啟並跳到該頁（null 為第一頁）。 */
  const [pdfView, setPdfView] = useState<number | null | false>(false);
  const [status, setStatus] = useState<"loading" | "analyzing" | "done" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopWatch() {
    esRef.current?.close();
    esRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  /** 掛上 job 的 SSE：階段事件更新進度文字，done 直接帶回 keypoints。 */
  function watchJob(jobId: string) {
    stopWatch();
    setStatus("analyzing");
    setError(null);
    setStageMsg(null);
    const startAt = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startAt) / 1000)), 1000);
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    esRef.current = es;
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as { type: string; data: unknown };
      if (event.type === "stage") {
        setStageMsg((event.data as { message: string }).message);
      } else if (event.type === "done") {
        stopWatch();
        setKeypoints((event.data as { keypoints: KeypointsData }).keypoints);
        setStatus("done");
        window.dispatchEvent(new Event("lr:refresh"));
      } else if (event.type === "failed") {
        stopWatch();
        setError((event.data as { error: string }).error);
        setStatus("failed");
      }
    };
    es.onerror = () => {
      // job 已不在（如 server 重啟）：退回查 DB 現況
      stopWatch();
      fetch(`/api/keypoints/${paperId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.keypoints) {
            setKeypoints(json.keypoints);
            setStatus("done");
          } else {
            setError("進度連線中斷，請重試");
            setStatus("failed");
          }
        });
    };
  }

  async function runAnalysis(forceRefresh: boolean) {
    setStatus("analyzing");
    setError(null);
    try {
      const res = await fetch(`/api/keypoints/${paperId}/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      const json = await res.json();
      if (!res.ok || !json.jobId) throw new Error(json.error ?? "啟動分析失敗");
      watchJob(json.jobId);
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
      .then(async (json) => {
        if (ignore) return;
        if (json?.keypoints) {
          setKeypoints(json.keypoints);
          setStatus("done");
          return;
        }
        // 沒有結果：先看有沒有進行中的 job（例如從 ⌘K 發起、或重整頁面），有就掛回去
        const jobRes = await fetch(`/api/keypoints/${paperId}/job`).then((r) => r.json()).catch(() => null);
        if (ignore) return;
        if (jobRes?.jobId) watchJob(jobRes.jobId);
        else runAnalysis(false);
      });
    return () => {
      ignore = true;
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  const hasPdf = Boolean(paper?.hasPdf);
  const openPdf = hasPdf ? (page: number | null) => setPdfView(page) : undefined;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
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

          <div className="mt-6 flex items-center gap-1 border-b border-hairline">
            <TabButton active={tab === "keypoints"} onClick={() => setTab("keypoints")}>
              重點
            </TabButton>
            <TabButton active={tab === "review"} onClick={() => setTab("review")}>
              審查
            </TabButton>
            <span className="flex-1" />
            {hasPdf && (
              <button
                type="button"
                onClick={() => setPdfView(pdfView === false ? null : false)}
                className={`mb-1 rounded-sm border px-3 py-1 text-[12px] font-medium transition-colors ${
                  pdfView !== false
                    ? "border-primary text-primary"
                    : "border-hairline-strong text-slate hover:border-slate"
                }`}
              >
                {pdfView !== false ? "關閉 PDF" : "開啟 PDF"}
              </button>
            )}
          </div>

          {tab === "keypoints" && (
            <KeypointsTab
              paperId={paperId}
              paper={paper}
              keypoints={keypoints}
              status={status}
              error={error}
              stageMsg={stageMsg}
              elapsed={elapsed}
              onRerun={() => runAnalysis(true)}
              onOpenPdf={openPdf}
            />
          )}
          {tab === "review" && (
            <ReviewTab paperId={paperId} hasKeypoints={Boolean(keypoints)} onOpenPdf={openPdf} />
          )}
        </div>
      </div>

      {pdfView !== false && hasPdf && (
        <PdfPanel
          paperId={paperId}
          page={pdfView}
          title={paper?.title}
          onClose={() => setPdfView(false)}
        />
      )}
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
  stageMsg,
  elapsed,
  onRerun,
  onOpenPdf,
}: {
  paperId: string;
  paper: WorkspaceItem | null;
  keypoints: KeypointsData | null;
  status: "loading" | "analyzing" | "done" | "failed";
  error: string | null;
  stageMsg: string | null;
  elapsed: number;
  onRerun: () => void;
  onOpenPdf?: (page: number) => void;
}) {
  const STAGES = ["抓取全文", "LLM 分析", "完成"];
  const stageIndex = stageMsg?.startsWith("分析中") ? 1 : 0;
  return (
    <>
      {status === "loading" && <p className="mt-8 text-sm text-steel">載入中…</p>}

      {status === "analyzing" && (
        <div className="mt-8">
          <div className="flex items-center gap-2.5 text-sm text-slate">
            <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
            {stageMsg ?? "排隊中…"}
            <span className="font-mono text-[11px] text-steel">已耗時 {elapsed}s</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    i < stageIndex
                      ? "border-success/40 text-success"
                      : i === stageIndex
                        ? "border-primary text-primary"
                        : "border-hairline text-steel"
                  }`}
                >
                  {s}
                </span>
                {i < STAGES.length - 1 && <span className="h-px w-5 bg-hairline-strong" />}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-steel">全文擷取＋LLM 分析可能需要數分鐘，可先離開此頁，回來會自動接上進度。</p>
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

          {!keypoints.evidence && keypoints.fulltextSource !== "abstract_only" && (
            <p className="mt-3 text-[12px] text-steel">
              此結果沒有出處資料——「重新分析」後即可 hover 內容查看原文引文與頁碼。
            </p>
          )}

          <dl className="mt-6 divide-y divide-hairline border-t border-hairline">
            <Field label="研究問題" value={keypoints.researchQuestion} evidence={keypoints.evidence?.research_question} onOpenPdf={onOpenPdf} />
            <Field label="研究方法" value={keypoints.methodology} evidence={keypoints.evidence?.methodology} onOpenPdf={onOpenPdf} />
            <Field label="主要發現" value={keypoints.keyFindings} evidence={keypoints.evidence?.key_findings} onOpenPdf={onOpenPdf} />
            <Field label="資料與實驗" value={keypoints.dataExperiments} evidence={keypoints.evidence?.data_experiments} onOpenPdf={onOpenPdf} />
            <Field label="主要貢獻" value={keypoints.contributions} evidence={keypoints.evidence?.contributions} onOpenPdf={onOpenPdf} />
            <Field label="侷限性" value={keypoints.limitations} evidence={keypoints.evidence?.limitations} onOpenPdf={onOpenPdf} />
            <Field label="新穎度" value={`${keypoints.noveltyRating} — ${keypoints.noveltyReason}`} evidence={keypoints.evidence?.novelty_reason} onOpenPdf={onOpenPdf} />
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

function Field({
  label,
  value,
  evidence,
  onOpenPdf,
}: {
  label: string;
  value: string;
  evidence?: EvidenceItem[];
  onOpenPdf?: (page: number) => void;
}) {
  return (
    <div className="py-5">
      <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">{label}</dt>
      <dd className="mt-1.5 text-[15px] leading-[1.7]">
        <EvidenceHover items={evidence} onOpenPdf={onOpenPdf}>
          {value}
        </EvidenceHover>
      </dd>
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

function ReviewTab({
  paperId,
  hasKeypoints,
  onOpenPdf,
}: {
  paperId: string;
  hasKeypoints: boolean;
  onOpenPdf?: (page: number) => void;
}) {
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
  const evidence = review.data.evidence;

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
              <p className="mt-1 text-[12.5px] leading-[1.6] text-slate">
                <EvidenceHover items={evidence?.scores?.[dim]} onOpenPdf={onOpenPdf}>
                  {s.reason}
                </EvidenceHover>
              </p>
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
                <EvidenceHover items={evidence?.strengths?.[i]} onOpenPdf={onOpenPdf}>
                  {s}
                </EvidenceHover>
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
                <EvidenceHover items={evidence?.weaknesses?.[i]} onOpenPdf={onOpenPdf}>
                  {s}
                </EvidenceHover>
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
