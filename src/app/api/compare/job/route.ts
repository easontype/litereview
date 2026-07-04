import { NextRequest, NextResponse } from "next/server";
import { getPaper } from "@/lib/db";
import { startCompareJob } from "@/lib/compare/job";

/** 建立比較 job：立即回傳 jobId，進度經 GET /api/jobs/[id]/events 串流，done 事件帶 compareId。 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paperIds = (body as { paperIds?: unknown } | null)?.paperIds;

  if (
    !Array.isArray(paperIds) ||
    paperIds.length < 2 ||
    paperIds.length > 6 ||
    !paperIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "paperIds 需為 2–6 篇論文 id 的陣列" }, { status: 400 });
  }
  for (const id of paperIds as string[]) {
    if (!getPaper(id)) return NextResponse.json({ error: `找不到論文: ${id}` }, { status: 404 });
  }

  return NextResponse.json({ jobId: startCompareJob(paperIds as string[]) });
}
