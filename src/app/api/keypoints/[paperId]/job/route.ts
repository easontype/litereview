import { NextRequest, NextResponse } from "next/server";
import { getPaper } from "@/lib/db";
import { getActiveJob } from "@/lib/jobs/store";
import { keypointsJobKey, startKeypointsJob } from "@/lib/keypoints/job";

/** 回報這篇論文是否有進行中的找重點 job（頁面重整後重新掛 SSE 用）。 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  return NextResponse.json({ jobId: getActiveJob(keypointsJobKey(paperId)) });
}

/** 建立找重點 job：立即回傳 jobId，進度經 GET /api/jobs/[id]/events 串流。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  if (!getPaper(paperId)) return NextResponse.json({ error: "找不到論文" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { forceRefresh?: boolean };
  const jobId = startKeypointsJob(paperId, Boolean(body.forceRefresh));
  return NextResponse.json({ jobId });
}
