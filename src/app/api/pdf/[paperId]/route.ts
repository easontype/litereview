import { NextResponse } from "next/server";
import { getUploadedPdf } from "@/lib/fulltext/upload-store";

/** 供 iframe 內嵌閱覽本機 PDF（上傳或 Unpaywall 落地的檔案）。 */
export async function GET(_req: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  // paperId 是 sha1 前 16 碼 hex；順便擋掉路徑穿越
  if (!/^[a-f0-9]{16}$/.test(paperId)) {
    return NextResponse.json({ error: "無效的論文 id" }, { status: 400 });
  }
  const buffer = getUploadedPdf(paperId);
  if (!buffer) return NextResponse.json({ error: "沒有本機 PDF" }, { status: 404 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${paperId}.pdf"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
