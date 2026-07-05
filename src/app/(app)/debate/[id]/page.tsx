"use client";

import { Fragment, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EvidenceHover } from "@/components/evidence-popover";

interface DebateTurn {
  role: "proponent" | "opponent";
  phase: "opening" | "rebuttal" | "closing";
  round?: number;
  seatInfo: string;
  content: string;
}

interface DebateEvidenceRef {
  id: string;
  paperIndex: number;
  paperId: string;
  field: string;
  quote: string;
  page: number | null;
}

/** v1.6 以前的單裁判判決（舊紀錄降級顯示用）。 */
interface LegacyVerdict {
  winner: "proponent" | "opponent" | "draw";
  proponentScore: number;
  opponentScore: number;
  reasoning: string;
  seatInfo: string;
}

interface ScoreWithReason {
  score: number;
  reason: string;
}

interface JudgeVerdict {
  winner: "proponent" | "opponent" | "draw";
  criteria: Record<string, { proponent: ScoreWithReason; opponent: ScoreWithReason }>;
  proponentTotal: number;
  opponentTotal: number;
  reasoning: string;
  seatInfo: string;
}

/** v1.7 合議判決：分項 rubric + 多裁判一致度 + 引文硬指標。 */
interface VerdictV2 {
  version: 2;
  judges: JudgeVerdict[];
  finalWinner: "proponent" | "opponent" | "draw";
  agreement: string;
  scoreRange: Record<string, { proponent: [number, number]; opponent: [number, number] }>;
  citationStats: Record<"proponent" | "opponent", { total: number; unique: number }>;
}

type DebateVerdict = LegacyVerdict | VerdictV2;

function isVerdictV2(v: DebateVerdict): v is VerdictV2 {
  return "judges" in v;
}

const CRITERION_ORDER = ["argument_quality", "evidence_use", "rebuttal_strength", "responsiveness"];

const CRITERION_LABEL: Record<string, string> = {
  argument_quality: "論點品質",
  evidence_use: "證據運用",
  rebuttal_strength: "反駁力度",
  responsiveness: "回應完整度",
};

interface DebateMeta {
  id: string;
  motion: string;
  titles: string[];
  seats: Record<string, string>;
  status: "running" | "done" | "failed";
  createdAt: string;
}

const ROLE_LABEL = { proponent: "正方", opponent: "反方" } as const;
const PHASE_LABEL = { opening: "立論", rebuttal: "駁論", closing: "結辯" } as const;

const EVIDENCE_MARK_RE = /(【E\d+】)/g;

/**
 * 把發言內文中的【E#】標記渲染成可 hover 的引文 chip（未命中引文庫的標記原樣輸出）。
 * 舊紀錄（無引文庫）的逐字稿本無標記，天然降級為純文字。
 */
function ContentWithEvidence({
  text,
  evidenceById,
  onOpenPdf,
}: {
  text: string;
  evidenceById: Map<string, DebateEvidenceRef>;
  onOpenPdf: (ref: DebateEvidenceRef, page: number) => void;
}) {
  const parts = text.split(EVIDENCE_MARK_RE);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^【(E\d+)】$/.exec(part);
        const ref = m ? evidenceById.get(m[1]) : undefined;
        if (!ref) return <Fragment key={i}>{part}</Fragment>;
        return (
          <EvidenceHover key={i} items={[ref]} onOpenPdf={(page) => onOpenPdf(ref, page)}>
            <span data-testid="evidence-chip" className="font-mono text-[11px] font-semibold text-primary">
              【{ref.id}】
            </span>
          </EvidenceHover>
        );
      })}
    </>
  );
}

export default function DebateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [meta, setMeta] = useState<DebateMeta | null>(null);
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [evidence, setEvidence] = useState<DebateEvidenceRef[]>([]);
  const [live, setLive] = useState<DebateTurn | null>(null);
  const [judgeLive, setJudgeLive] = useState<{ idx: number; seatInfo: string; text: string } | null>(null);
  const [verdict, setVerdict] = useState<DebateVerdict | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;
    let es: EventSource | null = null;

    function applyDbState(
      debate: DebateMeta & {
        transcript: DebateTurn[];
        evidence: DebateEvidenceRef[] | null;
        verdict: DebateVerdict | null;
      }
    ) {
      setMeta(debate);
      setTurns(debate.transcript);
      setEvidence(debate.evidence ?? []);
      setVerdict(debate.verdict);
      if (debate.status === "failed") setError("辯論執行失敗（可回上一頁重新發起）");
    }

    fetch(`/api/debate/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (ignore) return;
        if (!json?.debate) {
          setNotFound(true);
          return;
        }
        const debate = json.debate as DebateMeta & {
          transcript: DebateTurn[];
          evidence: DebateEvidenceRef[] | null;
          verdict: DebateVerdict | null;
        };
        if (debate.status !== "running") {
          applyDbState(debate);
          return;
        }

        // 進行中：SSE 會重播 job 全部歷史事件再即時推送，逐字稿完全由事件流建立
        setMeta(debate);
        setEvidence(debate.evidence ?? []);
        setStage("連線中…");
        es = new EventSource(`/api/jobs/${id}/events`);
        es.onmessage = (msg) => {
          const event = JSON.parse(msg.data) as { type: string; data: unknown };
          if (event.type === "stage") {
            setStage((event.data as { message: string }).message);
          } else if (event.type === "evidence") {
            setEvidence(event.data as DebateEvidenceRef[]);
          } else if (event.type === "token") {
            // 逐字串流：正反方 token 疊進進行中氣泡；裁判 token 進評議區（合議庭換人時清空重來）
            const tok = event.data as DebateTurn & { text: string; judgeIndex?: number };
            setStage(null);
            if ((tok.role as string) === "judge") {
              const idx = tok.judgeIndex ?? 0;
              setJudgeLive((prev) =>
                prev && prev.idx === idx
                  ? { ...prev, text: prev.text + tok.text }
                  : { idx, seatInfo: tok.seatInfo, text: tok.text }
              );
            } else {
              setLive((prev) =>
                prev && prev.role === tok.role && prev.phase === tok.phase && prev.round === tok.round
                  ? { ...prev, content: prev.content + tok.text }
                  : { role: tok.role, phase: tok.phase, round: tok.round, seatInfo: tok.seatInfo, content: tok.text }
              );
            }
          } else if (event.type === "turn") {
            setStage(null);
            setLive(null);
            setTurns((prev) => [...prev, event.data as DebateTurn]);
          } else if (event.type === "verdict") {
            setJudgeLive(null);
            setVerdict(event.data as DebateVerdict);
          } else if (event.type === "done") {
            setStage(null);
            setMeta((prev) => (prev ? { ...prev, status: "done" } : prev));
            es?.close();
          } else if (event.type === "failed") {
            setStage(null);
            setError((event.data as { error: string }).error);
            setMeta((prev) => (prev ? { ...prev, status: "failed" } : prev));
            es?.close();
          }
        };
        es.onerror = () => {
          // job 已不在（如 server 重啟）：退回 DB 現況
          es?.close();
          fetch(`/api/debate/${id}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json2) => {
              if (!ignore && json2?.debate) applyDbState(json2.debate);
            });
        };
      });

    return () => {
      ignore = true;
      es?.close();
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-10">
        <p className="text-sm text-steel">找不到這場辯論。</p>
        <Link href="/debate" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← 回辯論頁
        </Link>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-10">
        <p className="text-sm text-steel">載入中…</p>
      </div>
    );
  }

  const evidenceById = new Map(evidence.map((ref) => [ref.id, ref]));
  const openEvidencePdf = (ref: DebateEvidenceRef, page: number) =>
    router.push(`/workspace/${ref.paperId}?pdf=${page}`);

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24 pt-10">
      {/* ── 標頭 ── */}
      <Link href="/debate" className="text-xs text-steel hover:text-primary">
        ← 辯論
      </Link>
      <h1 className="mt-2 font-serif text-[26px] font-bold leading-[1.3] tracking-[-0.3px]">
        {meta.motion}
      </h1>
      <p className="mt-2 text-sm text-slate">{meta.titles.join("、")}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
        <span>正方：{meta.seats.proponent}</span>
        <span>反方：{meta.seats.opponent}</span>
        <span>裁判：{meta.seats.judge}</span>
        {meta.seats.judge2 && <span>裁判二：{meta.seats.judge2}</span>}
        {meta.seats.judge3 && <span>裁判三：{meta.seats.judge3}</span>}
      </div>

      {/* ── 逐字稿 ── */}
      <div className="mt-8 space-y-5">
        {turns.map((turn, i) => {
          const isPro = turn.role === "proponent";
          return (
            <div key={i} className={`flex ${isPro ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] ${isPro ? "" : "text-right"}`}>
                <div
                  className={`mb-1.5 flex items-baseline gap-2 text-[11px] ${
                    isPro ? "" : "flex-row-reverse"
                  }`}
                >
                  <span className={`font-semibold ${isPro ? "text-primary" : "text-slate"}`}>
                    {ROLE_LABEL[turn.role]} · {PHASE_LABEL[turn.phase]}
                    {turn.round ? ` 第 ${turn.round} 輪` : ""}
                  </span>
                  <span className="font-mono text-[10px] text-steel">{turn.seatInfo}</span>
                </div>
                <div
                  className={`rounded-lg px-4.5 py-3.5 text-left text-[13.5px] leading-[1.7] ${
                    isPro
                      ? "rounded-tl-sm bg-primary-tint"
                      : "rounded-tr-sm border border-hairline bg-surface"
                  }`}
                >
                  {turn.content.split("\n").map((line, j) => (
                    <p key={j} className={j > 0 ? "mt-1.5" : ""}>
                      <ContentWithEvidence text={line} evidenceById={evidenceById} onOpenPdf={openEvidencePdf} />
                    </p>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 逐字串流中的發言氣泡 ── */}
      {live && (
        <div className={`mt-5 flex ${live.role === "proponent" ? "justify-start" : "justify-end"}`}>
          <div className={`max-w-[85%] ${live.role === "proponent" ? "" : "text-right"}`}>
            <div
              className={`mb-1.5 flex items-baseline gap-2 text-[11px] ${
                live.role === "proponent" ? "" : "flex-row-reverse"
              }`}
            >
              <span className={`font-semibold ${live.role === "proponent" ? "text-primary" : "text-slate"}`}>
                {ROLE_LABEL[live.role]} · {PHASE_LABEL[live.phase]}
                {live.round ? ` 第 ${live.round} 輪` : ""}
              </span>
              <span className="font-mono text-[10px] text-steel">{live.seatInfo}</span>
            </div>
            <div
              className={`rounded-lg px-4.5 py-3.5 text-left text-[13.5px] leading-[1.7] ${
                live.role === "proponent"
                  ? "rounded-tl-sm bg-primary-tint"
                  : "rounded-tr-sm border border-hairline bg-surface"
              }`}
            >
              {live.content.split("\n").map((line, j) => (
                <p key={j} className={j > 0 ? "mt-1.5" : ""}>
                  {line}
                  {j === live.content.split("\n").length - 1 && (
                    <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-primary align-[-2px]" />
                  )}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 裁判評議逐字串流 ── */}
      {judgeLive && !verdict && (
        <div className="mt-6 max-h-40 overflow-hidden rounded-md border border-hairline bg-surface px-4 py-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
            {meta.seats.judge2 ? `裁判 ${judgeLive.idx + 1} 評議中` : "裁判評議中"}
            <span className="ml-2 normal-case tracking-normal">{judgeLive.seatInfo}</span>
          </p>
          <p className="whitespace-pre-wrap font-mono text-[11px] leading-[1.6] text-slate">{judgeLive.text}</p>
        </div>
      )}

      {/* ── 進行中指示 ── */}
      {meta.status === "running" && !live && !judgeLive && (
        <div className="mt-6 flex items-center gap-2.5 text-sm text-slate">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          {stage ?? "辯手發言中…"}
        </div>
      )}

      {error && <p className="mt-6 text-sm text-error">辯論失敗：{error}</p>}

      {/* ── 判決卡：v1.7 合議判決；舊紀錄走 legacy 單裁判卡 ── */}
      {verdict && isVerdictV2(verdict) && (
        <VerdictV2Card verdict={verdict} evidenceById={evidenceById} onOpenPdf={openEvidencePdf} />
      )}
      {verdict && !isVerdictV2(verdict) && (
        <div className="mt-10 overflow-hidden rounded-md border border-hairline">
          <div className="flex items-center justify-between bg-surface px-5 py-3">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
              裁判判決
            </span>
            <span className="font-mono text-[10px] text-steel">{verdict.seatInfo}</span>
          </div>
          <div className="px-5 py-5">
            <p className="font-serif text-[20px] font-bold">
              {verdict.winner === "draw"
                ? "平手"
                : `${ROLE_LABEL[verdict.winner]}勝出`}
            </p>
            <div className="mt-4 flex gap-8">
              {(["proponent", "opponent"] as const).map((role) => {
                const score = role === "proponent" ? verdict.proponentScore : verdict.opponentScore;
                const isWinner = verdict.winner === role;
                return (
                  <div key={role} className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate">{ROLE_LABEL[role]}</span>
                      <span
                        className={`font-serif text-[22px] font-bold ${
                          isWinner ? "text-primary" : "text-steel"
                        }`}
                      >
                        {score}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className={`h-full rounded-full ${isWinner ? "bg-primary" : "bg-hairline-strong"}`}
                        style={{ width: `${score * 10}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-sm leading-[1.7]">
              {/* 裁判 prompt 不要求引用，但模型若自發帶【E#】標記也防禦性渲染成 chip */}
              <ContentWithEvidence text={verdict.reasoning} evidenceById={evidenceById} onOpenPdf={openEvidencePdf} />
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 一位小數。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** [min, max] 區間顯示：兩端相同就只顯示單一數字。 */
function rangeText(r: [number, number]): string {
  return r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`;
}

function VerdictV2Card({
  verdict,
  evidenceById,
  onOpenPdf,
}: {
  verdict: VerdictV2;
  evidenceById: Map<string, DebateEvidenceRef>;
  onOpenPdf: (ref: DebateEvidenceRef, page: number) => void;
}) {
  const multi = verdict.judges.length > 1;
  const unanimous = multi && verdict.judges.every((j) => j.winner === verdict.judges[0].winner);
  const pAvg = round1(verdict.judges.reduce((a, j) => a + j.proponentTotal, 0) / verdict.judges.length);
  const oAvg = round1(verdict.judges.reduce((a, j) => a + j.opponentTotal, 0) / verdict.judges.length);
  const badge = !multi
    ? { label: "單裁判", cls: "border-hairline-strong text-slate" }
    : unanimous
      ? { label: `${verdict.agreement} 一致・高信心`, cls: "border-success/40 bg-success/10 text-success" }
      : { label: `${verdict.agreement} 分歧`, cls: "border-warning/40 bg-warning-soft text-warning" };

  return (
    <div className="mt-10 overflow-hidden rounded-md border border-hairline" data-testid="verdict-v2">
      <div className="flex items-center justify-between bg-surface px-5 py-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          {multi ? "合議庭判決" : "裁判判決"}
        </span>
        <span
          data-testid="agreement-badge"
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
      <div className="px-5 py-5">
        <p className="font-serif text-[20px] font-bold">
          {verdict.finalWinner === "draw" ? "平手" : `${ROLE_LABEL[verdict.finalWinner]}勝出`}
        </p>
        {multi && !unanimous && (
          <p className="mt-1 text-[12.5px] text-slate">
            裁判意見分歧（{verdict.agreement}），此結果的信心較低，建議閱讀下方各裁判理由後自行判斷。
          </p>
        )}

        {/* 總分（分項平均由程式計算，非 LLM 給分） */}
        <div className="mt-4 flex gap-8">
          {(["proponent", "opponent"] as const).map((role) => {
            const score = role === "proponent" ? pAvg : oAvg;
            const isWinner = verdict.finalWinner === role;
            return (
              <div key={role} className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate">{ROLE_LABEL[role]}</span>
                  <span
                    className={`font-serif text-[22px] font-bold ${isWinner ? "text-primary" : "text-steel"}`}
                  >
                    {score}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className={`h-full rounded-full ${isWinner ? "bg-primary" : "bg-hairline-strong"}`}
                    style={{ width: `${score * 10}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 分項分數表（跨裁判 min–max 區間） */}
        <div className="mt-5 overflow-hidden rounded-sm border border-hairline">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface text-left text-[11px] text-steel">
                <th className="px-3 py-1.5 font-medium">分項維度</th>
                <th className="px-3 py-1.5 text-right font-medium">正方</th>
                <th className="px-3 py-1.5 text-right font-medium">反方</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {CRITERION_ORDER.filter((c) => verdict.scoreRange[c]).map((c) => (
                <tr key={c}>
                  <td className="px-3 py-1.5">{CRITERION_LABEL[c] ?? c}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{rangeText(verdict.scoreRange[c].proponent)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{rangeText(verdict.scoreRange[c].opponent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 引文硬指標（程式從逐字稿統計，零 LLM） */}
        <p className="mt-3 font-mono text-[11px] text-steel" data-testid="citation-stats">
          引文運用（程式統計）：正方引用 {verdict.citationStats.proponent.total} 次・
          {verdict.citationStats.proponent.unique} 條不重複｜反方引用 {verdict.citationStats.opponent.total} 次・
          {verdict.citationStats.opponent.unique} 條不重複
        </p>

        {/* 各裁判獨立判決 */}
        <div className="mt-5 flex flex-col gap-3">
          {verdict.judges.map((judge, i) => (
            <div key={i} className="rounded-sm border border-hairline bg-canvas px-4 py-3" data-testid="judge-verdict">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[12.5px] font-semibold">
                  {multi ? `裁判 ${i + 1}` : "裁判"}：
                  {judge.winner === "draw" ? "平手" : `${ROLE_LABEL[judge.winner]}勝`}
                </span>
                <span className="font-mono text-[11px] text-slate">
                  {judge.proponentTotal} : {judge.opponentTotal}
                </span>
                <span className="ml-auto font-mono text-[10px] text-steel">{judge.seatInfo}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-[1.65]">
                <ContentWithEvidence text={judge.reasoning} evidenceById={evidenceById} onOpenPdf={onOpenPdf} />
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11.5px] text-steel hover:text-slate">分項評語</summary>
                <div className="mt-2 flex flex-col gap-1.5">
                  {CRITERION_ORDER.filter((c) => judge.criteria[c]).map((c) => (
                    <div key={c} className="text-[12px] leading-[1.6] text-slate">
                      <span className="font-medium text-ink">{CRITERION_LABEL[c] ?? c}</span>
                      ：正方 {judge.criteria[c].proponent.score} — {judge.criteria[c].proponent.reason || "（無評語）"}
                      ／反方 {judge.criteria[c].opponent.score} — {judge.criteria[c].opponent.reason || "（無評語）"}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
