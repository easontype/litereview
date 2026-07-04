import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/db";
import { getPdf2mdCommand } from "@/lib/fulltext/external-converter";

/** 外部 PDF→Markdown 轉換命令不是機密，直接回傳全文供編輯。 */
export async function GET() {
  return NextResponse.json({ command: getPdf2mdCommand() ?? "" });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  if (command && !command.includes("{input}")) {
    return NextResponse.json({ error: "命令必須包含 {input} placeholder" }, { status: 400 });
  }
  setSetting("pdf2md_command", command || null);
  return NextResponse.json({ status: "ok" });
}
