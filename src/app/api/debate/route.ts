import { NextRequest, NextResponse } from "next/server";
import { createDebate, getPaper, listDebates } from "@/lib/db";
import { createJob } from "@/lib/jobs/store";
import { runDebate, seatInfoLabel } from "@/lib/debate/engine";

export async function GET() {
  return NextResponse.json({ debates: listDebates() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    motion?: unknown;
    paperIds?: unknown;
    rounds?: unknown;
  };

  const motion = typeof body.motion === "string" ? body.motion.trim() : "";
  if (!motion) return NextResponse.json({ error: "請輸入辯題" }, { status: 400 });

  const paperIds = Array.isArray(body.paperIds)
    ? body.paperIds.filter((id): id is string => typeof id === "string")
    : [];
  if (paperIds.length < 1 || paperIds.length > 6) {
    return NextResponse.json({ error: "請選擇 1–6 篇論文" }, { status: 400 });
  }
  for (const id of paperIds) {
    if (!getPaper(id)) return NextResponse.json({ error: `找不到論文: ${id}` }, { status: 404 });
  }

  const rounds = body.rounds === 2 ? 2 : 1;

  const seats = {
    proponent: seatInfoLabel("proponent"),
    opponent: seatInfoLabel("opponent"),
    judge: seatInfoLabel("judge"),
  };
  const debateId = createDebate(motion, paperIds, seats);
  createJob(debateId);
  // 背景執行，不 await；錯誤已在 engine 內轉成 failDebate/failJob
  void runDebate(debateId, motion, paperIds, rounds);

  return NextResponse.json({ debateId });
}
