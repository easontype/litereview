import { NextRequest, NextResponse } from "next/server";
import { getComparison } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comparison = getComparison(id);
  if (!comparison) return NextResponse.json({ error: "找不到比較紀錄" }, { status: 404 });
  return NextResponse.json(comparison);
}
