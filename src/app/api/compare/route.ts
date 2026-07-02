import { NextRequest, NextResponse } from "next/server";
import { getPaper, saveComparison } from "@/lib/db";
import { ensureKeypoints } from "@/lib/keypoints/analyze";
import { buildComparePrompt } from "@/lib/compare/prompt";
import { parseCompareResponse } from "@/lib/compare/parse";
import { runClaude } from "@/lib/llm/claude-cli";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paperIds = (body as { paperIds?: unknown } | null)?.paperIds;

  if (!Array.isArray(paperIds) || paperIds.length < 2 || paperIds.length > 6 || !paperIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "paperIds 需為 2–6 篇論文 id 的陣列" }, { status: 400 });
  }

  for (const id of paperIds as string[]) {
    if (!getPaper(id)) return NextResponse.json({ error: `找不到論文: ${id}` }, { status: 404 });
  }

  try {
    const papers = [];
    for (const id of paperIds as string[]) {
      const paper = getPaper(id)!;
      const keypoints = await ensureKeypoints(id);
      papers.push({ id, title: paper.title, keypoints });
    }

    const prompt = buildComparePrompt(papers);
    const raw = await runClaude(prompt);
    const result = parseCompareResponse(raw, papers.length);
    const id = saveComparison(paperIds as string[], result);

    return NextResponse.json({ id, paperIds, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
