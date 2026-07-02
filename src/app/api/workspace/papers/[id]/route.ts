import { NextRequest, NextResponse } from "next/server";
import { removeFromWorkspace } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  removeFromWorkspace(id);
  return NextResponse.json({ ok: true });
}
