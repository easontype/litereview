import { NextResponse } from "next/server";
import { convertViaExternalCommand, getPdf2mdCommand } from "@/lib/fulltext/external-converter";
import { extractPdfText } from "@/lib/fulltext/pdf-to-text";
import { buildSamplePdf } from "@/lib/fulltext/sample-pdf";

/** 用內嵌樣本 PDF 實測 PDF 轉換：有外部命令就測命令，沒有就測內建 pdfjs 抽取。 */
export async function POST() {
  const sample = buildSamplePdf([
    "litereview PDF conversion test.",
    "If you can read this, the converter works.",
  ]);
  const command = getPdf2mdCommand();
  try {
    const text = command
      ? await convertViaExternalCommand(sample, command)
      : await extractPdfText(sample);
    if (!text.trim()) throw new Error("轉換結果為空");
    return NextResponse.json({
      ok: true,
      tier: command ? "external" : "builtin",
      preview: text.trim().slice(0, 120),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
