import { NextRequest, NextResponse } from "next/server";
import { createUploadedPaper } from "@/lib/db";
import { saveUploadedPdf } from "@/lib/fulltext/upload-store";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 為必填" }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "只接受 PDF 檔案" }, { status: 400 });
  }

  const titleRaw = form?.get("title");
  const title = (typeof titleRaw === "string" && titleRaw.trim()) || file.name.replace(/\.pdf$/i, "");

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = createUploadedPaper(title);
  saveUploadedPdf(id, buffer);

  return NextResponse.json({ id, title });
}
