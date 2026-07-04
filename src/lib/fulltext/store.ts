import { getFulltextRow, saveFulltextRow } from "@/lib/db";
import { getFullText, type FullTextInput, type FullTextResult, type FullTextSource } from "./index";
import { getUploadedPdf, saveUploadedPdf } from "./upload-store";

/**
 * 全文的單一取得入口：優先讀 fulltexts 快取（分析與審查共用同一份、頁碼一致），
 * 沒有快取或要求 refresh 時重抽並回存；Unpaywall 抓到的 PDF 順手落地供閱覽。
 * 這次請求帶了新上傳的 buffer 就一律重抽（換檔要立即生效）。
 */
export async function getFullTextCached(
  paperId: string,
  input: FullTextInput,
  uploadBuffer?: Buffer | null,
  opts?: { refresh?: boolean }
): Promise<FullTextResult> {
  const refresh = Boolean(opts?.refresh || uploadBuffer);
  if (!refresh) {
    const row = getFulltextRow(paperId);
    if (row) return { text: row.text, source: row.source as FullTextSource, pageCount: row.pageCount };
  }

  const result = await getFullText(input, uploadBuffer ?? getUploadedPdf(paperId));
  if (result.source !== "abstract_only") {
    saveFulltextRow(paperId, result.source, result.text, result.pageCount);
  }
  if (result.pdfBuffer) {
    saveUploadedPdf(paperId, result.pdfBuffer);
  }
  return result;
}
