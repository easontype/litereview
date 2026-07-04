import { convertPdfToText, type PdfConvertResult } from "./pdf-convert";

export interface OaPdfResult extends PdfConvertResult {
  /** 原始 PDF 二進位，讓上層落地存檔供之後閱覽。 */
  buffer: Buffer;
}

interface UnpaywallResponse {
  best_oa_location?: { url_for_pdf?: string | null; url?: string | null } | null;
}

async function findOaPdfUrl(doi: string): Promise<string | null> {
  // Unpaywall 拒收 example.com 之類的佔位 email（422），沒設 CONTACT_EMAIL 就直接跳過查詢
  const email = process.env.CONTACT_EMAIL;
  if (!email) return null;
  const res = await fetch(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as UnpaywallResponse;
  return data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url ?? null;
}

/** 用 DOI 查 Unpaywall 找開放取用 PDF；查不到就退回既有 pdfUrl。找到後走地端 PDF 轉換取全文。 */
export async function fetchOaPdfText(params: { doi: string | null; pdfUrl: string | null }): Promise<OaPdfResult | null> {
  const pdfUrl = (params.doi ? await findOaPdfUrl(params.doi) : null) ?? params.pdfUrl;
  if (!pdfUrl) return null;

  const res = await fetch(pdfUrl);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const converted = await convertPdfToText(buffer);
  return { ...converted, buffer };
}
