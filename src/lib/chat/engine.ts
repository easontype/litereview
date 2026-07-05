import {
  appendChatMessage,
  createDebate,
  getChat,
  getComparison,
  getPaper,
  listChatMessages,
  type ChatMessageRow,
  type ChatRow,
} from "@/lib/db";
import { completeJob, createJob, emit, failJob, getActiveJob, registerActive } from "@/lib/jobs/store";
import { BUILTIN_CLAUDE_CLI, getLlmConfig, instantiateProvider } from "@/lib/llm/registry";
import { streamChatReply } from "@/lib/llm/chat";
import type { ChatContentPart, ChatTurnMessage, LlmProvider } from "@/lib/llm/types";
import { SCORE_DIMENSIONS, SCORE_LABEL } from "@/lib/review/parse";
import { runReview } from "@/lib/review/run";
import { runCompare } from "@/lib/compare/job";
import { runDebate, seatInfoLabel } from "@/lib/debate/engine";
import { buildChatContext } from "./context";
import { getChatImage } from "./image-store";

/** 依對話設定解析 provider 與 model；指派失效時安全退回 claude-cli 預設（與 resolveSeat 同精神）。 */
export function resolveChatProvider(chat: Pick<ChatRow, "providerId" | "model">): {
  provider: LlmProvider;
  model: string;
} {
  const config = getLlmConfig();
  const providerConfig =
    config.providers.find((p) => p.id === chat.providerId) ?? BUILTIN_CLAUDE_CLI;
  const model =
    providerConfig.id === chat.providerId && chat.model
      ? chat.model
      : providerConfig.models[0];
  return { provider: instantiateProvider(providerConfig), model };
}

interface ChatCommand {
  name: "review" | "compare" | "debate";
  arg: string;
}

/** 訊息以 /review、/compare、/debate 開頭時視為命令（帶圖片的訊息不當命令）。 */
export function parseCommand(text: string): ChatCommand | null {
  const m = /^\/(review|compare|debate)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  return { name: m[1] as ChatCommand["name"], arg: m[2]?.trim() ?? "" };
}

/** 起回覆 job：同一對話已有進行中 job 就直接回它（去重），供頁面重整後重掛。 */
export function startChatReplyJob(chatId: string): string {
  const existing = getActiveJob(`chat:${chatId}`);
  if (existing) return existing;
  const chat = getChat(chatId);
  if (!chat) throw new Error(`找不到對話: ${chatId}`);
  const jobId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  createJob(jobId);
  registerActive(`chat:${chatId}`, jobId);
  void run(jobId, chat);
  return jobId;
}

async function run(jobId: string, chat: ChatRow): Promise<void> {
  try {
    const history = listChatMessages(chat.id);
    const last = history[history.length - 1];
    if (!last || last.role !== "user") throw new Error("沒有可回覆的使用者訊息");

    const command = last.images.length === 0 ? parseCommand(last.content) : null;
    if (command) {
      const messageId = await handleCommand(jobId, chat, command);
      completeJob(jobId, { messageId });
      return;
    }

    emit(jobId, "stage", { stage: "context", message: "準備論文脈絡…" });
    const context = await buildChatContext(chat.paperIds);
    emit(jobId, "context", { injected: context.injected });

    const turns = buildTurns(history, context.contextText);
    const { provider, model } = resolveChatProvider(chat);
    emit(jobId, "stage", { stage: "reply", message: `回覆生成中（${provider.label} · ${model}）…` });

    let full = "";
    for await (const token of streamChatReply(provider, turns, { model })) {
      full += token;
      emit(jobId, "token", { text: token });
    }
    if (!full.trim()) throw new Error("模型回傳空內容");
    const messageId = appendChatMessage(chat.id, "assistant", full);
    completeJob(jobId, { messageId });
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err));
  }
}

function toTurn(msg: ChatMessageRow): ChatTurnMessage {
  if (msg.images.length === 0) return { role: msg.role, content: msg.content };
  const parts: ChatContentPart[] = [];
  for (const name of msg.images) {
    const img = getChatImage(name);
    if (img) parts.push({ type: "image", mimeType: img.mime, data: img.buffer.toString("base64") });
  }
  if (msg.content) parts.push({ type: "text", text: msg.content });
  return { role: msg.role, content: parts };
}

/** 合併連續同角色的訊息（前一輪失敗未留下助理回覆時會出現），避免 API provider 拒絕非交替訊息。 */
function mergeTurns(turns: ChatTurnMessage[]): ChatTurnMessage[] {
  const out: ChatTurnMessage[] = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) {
      if (typeof prev.content === "string" && typeof t.content === "string") {
        prev.content = `${prev.content}\n\n${t.content}`;
      } else {
        const a: ChatContentPart[] =
          typeof prev.content === "string" ? [{ type: "text", text: prev.content }] : prev.content;
        const b: ChatContentPart[] =
          typeof t.content === "string" ? [{ type: "text", text: t.content }] : t.content;
        prev.content = [...a, ...b];
      }
    } else {
      out.push({ role: t.role, content: t.content });
    }
  }
  return out;
}

function buildTurns(history: ChatMessageRow[], contextText: string): ChatTurnMessage[] {
  const turns = history.map(toTurn);
  if (contextText) turns.unshift({ role: "user", content: contextText });
  return mergeTurns(turns);
}

async function handleCommand(jobId: string, chat: ChatRow, command: ChatCommand): Promise<string> {
  if (command.name === "review") {
    if (chat.paperIds.length !== 1) {
      return appendChatMessage(
        chat.id,
        "assistant",
        `/review 需要在對話中恰好選擇 1 篇論文（目前 ${chat.paperIds.length} 篇）。請調整論文選擇後再試。`,
        [],
        { kind: "error" }
      );
    }
    const paperId = chat.paperIds[0];
    const title = getPaper(paperId)?.title ?? paperId;
    emit(jobId, "stage", { stage: "review", message: `審查中：${title.slice(0, 40)}…` });
    const review = await runReview(paperId);
    const scoreLine = SCORE_DIMENSIONS.map(
      (d) => `${SCORE_LABEL[d]} ${review.data.scores[d].score}/10`
    ).join("、");
    const content = [
      `已完成《${title}》的審查（${review.seatInfo}）。`,
      "",
      scoreLine,
      ...(review.data.weaknesses.length ? ["", `主要弱點：${review.data.weaknesses[0]}`] : []),
    ].join("\n");
    return appendChatMessage(chat.id, "assistant", content, [], { kind: "review", paperId });
  }

  if (command.name === "compare") {
    if (chat.paperIds.length < 2) {
      return appendChatMessage(
        chat.id,
        "assistant",
        `/compare 需要在對話中選擇至少 2 篇論文（目前 ${chat.paperIds.length} 篇）。請調整論文選擇後再試。`,
        [],
        { kind: "error" }
      );
    }
    const compareId = await runCompare(chat.paperIds, (stage, message) =>
      emit(jobId, "stage", { stage, message })
    );
    const comparison = getComparison(compareId);
    const content = [`已完成 ${chat.paperIds.length} 篇論文的五維比較。`, "", comparison?.verdict ?? ""]
      .join("\n")
      .trim();
    return appendChatMessage(chat.id, "assistant", content, [], { kind: "compare", compareId });
  }

  const motion = command.arg;
  if (!motion) {
    return appendChatMessage(
      chat.id,
      "assistant",
      "/debate 需要辯題，例如：/debate 本文方法的效能提升主要來自資料規模而非架構創新",
      [],
      { kind: "error" }
    );
  }
  if (chat.paperIds.length < 1) {
    return appendChatMessage(
      chat.id,
      "assistant",
      "/debate 需要在對話中至少選擇 1 篇論文。請調整論文選擇後再試。",
      [],
      { kind: "error" }
    );
  }
  // 與 /api/debate 相同的建立流程（單裁判）；逐字稿留在辯論頁，聊天室只落連結卡
  const seats: Record<string, string> = {
    proponent: seatInfoLabel("proponent"),
    opponent: seatInfoLabel("opponent"),
    judge: seatInfoLabel("judge"),
  };
  const debateId = createDebate(motion, chat.paperIds, seats);
  createJob(debateId);
  void runDebate(debateId, motion, chat.paperIds, 1, 1);
  return appendChatMessage(
    chat.id,
    "assistant",
    `辯論已發起：「${motion}」。正反方將依所選論文進行攻防，可從下方連結追蹤逐字稿與判決。`,
    [],
    { kind: "debate", debateId, motion }
  );
}
