import { NextRequest, NextResponse } from "next/server";
import { addToWorkspace, listWorkspace, upsertPaper } from "@/lib/db";
import { getRank } from "@/lib/rankings/lookup";
import type { PaperResult } from "@/lib/scholarly/types";

export async function GET() {
  return NextResponse.json({
    items: listWorkspace().map((item) => ({ ...item, rank: getRank(item.issn, item.venue) })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paper = body?.paper as PaperResult | undefined;
  if (!paper || !paper.title) {
    return NextResponse.json({ error: "paper 為必填" }, { status: 400 });
  }

  const id = upsertPaper(paper);
  addToWorkspace(id);
  return NextResponse.json({ id });
}
