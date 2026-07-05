import { NextRequest, NextResponse } from "next/server";
import { getPaper, getReview } from "@/lib/db";
import { runReview } from "@/lib/review/run";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const review = getReview(paperId);
  if (!review) return NextResponse.json({ error: "尚未審查" }, { status: 404 });
  return NextResponse.json({ status: "done", review });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  if (!getPaper(paperId)) return NextResponse.json({ error: "找不到論文" }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const forceRefresh = Boolean((body as { forceRefresh?: boolean }).forceRefresh);

  try {
    const review = await runReview(paperId, forceRefresh);
    return NextResponse.json({ status: "done", review });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
