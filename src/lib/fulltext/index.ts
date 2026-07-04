import { fetchArxivFullText } from "./arxiv-parser";
import { convertPdfToText } from "./pdf-convert";
import { fetchOaPdfText } from "./oa-pdf-fetch";

export type FullTextSource = "arxiv" | "upload" | "unpaywall" | "abstract_only";

export interface FullTextResult {
  text: string;
  source: FullTextSource;
  /** null＝文字裡沒有頁碼標記（arXiv HTML、Tier 2 外部轉換、abstract_only）。 */
  pageCount: number | null;
  /** 只有 unpaywall 命中時帶原始 PDF，讓呼叫端落地存檔供閱覽。 */
  pdfBuffer?: Buffer;
}

export interface FullTextInput {
  arxivId: string | null;
  doi: string | null;
  pdfUrl: string | null;
  abstract: string;
}

/** 文字裡是否帶頁碼標記——依文字本身判斷而非 source（Tier 2 轉換的上傳檔也沒有標記）。 */
export function hasPageMarkers(text: string): boolean {
  return /【第 \d+ 頁】/.test(text);
}

/** 依優先序取得全文：arXiv → 上傳 PDF → Unpaywall → 全部失敗時退回 abstract_only。 */
export async function getFullText(paper: FullTextInput, uploadBuffer?: Buffer | null): Promise<FullTextResult> {
  if (paper.arxivId) {
    try {
      const text = await fetchArxivFullText(paper.arxivId);
      if (text.trim()) return { text, source: "arxiv", pageCount: null };
    } catch {
      // 全文擷取失敗就往下一個來源 fallback
    }
  }

  if (uploadBuffer) {
    try {
      const { text, pageCount } = await convertPdfToText(uploadBuffer);
      if (text.trim()) return { text, source: "upload", pageCount };
    } catch {
      // 忽略，繼續 fallback
    }
  }

  if (paper.doi || paper.pdfUrl) {
    try {
      const result = await fetchOaPdfText({ doi: paper.doi, pdfUrl: paper.pdfUrl });
      if (result && result.text.trim()) {
        return { text: result.text, source: "unpaywall", pageCount: result.pageCount, pdfBuffer: result.buffer };
      }
    } catch {
      // 忽略，繼續 fallback
    }
  }

  return { text: paper.abstract, source: "abstract_only", pageCount: null };
}
