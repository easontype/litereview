import { failDebate, finishDebate, getPaper, updateDebateEvidence, updateDebateTranscript } from "@/lib/db";
import { ensureKeypoints } from "@/lib/keypoints/analyze";
import { resolveSeat } from "@/lib/llm/registry";
import type { SeatName } from "@/lib/llm/types";
import { completeJob, emit, failJob } from "@/lib/jobs/store";
import {
  buildDebateEvidenceIndex,
  buildSpeechPrompt,
  buildVerdictPrompt,
  type DebatePaperContext,
} from "./prompt";
import {
  parseVerdictResponse,
  type DebatePhase,
  type DebateRole,
  type DebateTurn,
} from "./parse";

/** 「provider label · model」，逐字稿與判決卡顯示模型徽章用。 */
export function seatInfoLabel(seat: SeatName): string {
  const resolved = resolveSeat(seat);
  return `${resolved.provider.label} · ${resolved.model}`;
}

/**
 * 跑一整場辯論（非同步背景執行，呼叫端不 await）：
 * 正方立論 → 反方立論 → 交叉駁論 ×rounds → 雙方結辯 → 裁判判決。
 * 每回合經 resolveSeat 取當下座位設定、emit SSE 事件、增量存 transcript；
 * jobId 即 debateId。
 */
export async function runDebate(
  debateId: string,
  motion: string,
  paperIds: string[],
  rounds: number
): Promise<void> {
  try {
    emit(debateId, "stage", { message: "準備論文脈絡（找重點）…" });
    const papers: DebatePaperContext[] = [];
    for (const paperId of paperIds) {
      const paper = getPaper(paperId);
      if (!paper) throw new Error(`找不到論文: ${paperId}`);
      const keypoints = await ensureKeypoints(paperId);
      papers.push({ paperId, title: paper.title, keypoints });
    }

    // 引文庫：從各論文 keypoints 的出處引文編成【E#】索引，存庫並推給進行中頁面
    const evidence = buildDebateEvidenceIndex(papers);
    updateDebateEvidence(debateId, evidence);
    emit(debateId, "evidence", evidence);

    const transcript: DebateTurn[] = [];

    /** 有 chatStream 就逐字 emit token 事件（UI 即時長字），否則退回一次拿完。 */
    const generate = async (
      seat: ReturnType<typeof resolveSeat>,
      prompt: string,
      tokenMeta: Record<string, unknown>
    ): Promise<string> => {
      if (seat.provider.chatStream) {
        let acc = "";
        for await (const chunk of seat.provider.chatStream(prompt, { model: seat.model })) {
          acc += chunk;
          emit(debateId, "token", { ...tokenMeta, text: chunk });
        }
        return acc.trim();
      }
      return (await seat.provider.chat(prompt, { model: seat.model })).trim();
    };

    const speak = async (role: DebateRole, phase: DebatePhase, round?: number) => {
      const seat = resolveSeat(role);
      const seatInfo = `${seat.provider.label} · ${seat.model}`;
      const prompt = buildSpeechPrompt(motion, papers, transcript, role, phase, evidence);
      const content = await generate(seat, prompt, {
        role,
        phase,
        ...(round ? { round } : {}),
        seatInfo,
      });
      const turn: DebateTurn = { role, phase, ...(round ? { round } : {}), seatInfo, content };
      transcript.push(turn);
      updateDebateTranscript(debateId, transcript);
      emit(debateId, "turn", turn);
    };

    await speak("proponent", "opening");
    await speak("opponent", "opening");
    for (let round = 1; round <= rounds; round++) {
      await speak("proponent", "rebuttal", round);
      await speak("opponent", "rebuttal", round);
    }
    await speak("proponent", "closing");
    await speak("opponent", "closing");

    emit(debateId, "stage", { message: "裁判評議中…" });
    const judge = resolveSeat("judge");
    const judgeInfo = `${judge.provider.label} · ${judge.model}`;
    const raw = await generate(judge, buildVerdictPrompt(motion, transcript), {
      role: "judge",
      seatInfo: judgeInfo,
    });
    const verdict = parseVerdictResponse(raw, judgeInfo);

    finishDebate(debateId, verdict);
    emit(debateId, "verdict", verdict);
    completeJob(debateId, { debateId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failDebate(debateId);
    failJob(debateId, message);
  }
}
