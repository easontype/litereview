import { NextRequest, NextResponse } from "next/server";
import { getDebate } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debate = getDebate(id);
  if (!debate) return NextResponse.json({ error: "找不到辯論" }, { status: 404 });
  return NextResponse.json({ debate });
}
