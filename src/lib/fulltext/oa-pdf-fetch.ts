import { parsePdfToMarkdown } from "./marker-parser";

interface UnpaywallResponse {
  best_oa_location?: { url_for_pdf?: string | null; url?: string | null } | null;
}

async function findOaPdfUrl(doi: string): Promise<string | null> {
  const email = process.env.CONTACT_EMAIL || "litereview@example.com";
  const res = await fetch(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as UnpaywallResponse;
  return data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url ?? null;
}

/** 用 DOI 查 Unpaywall 找開放取用 PDF；查不到就退回既有 pdfUrl。找到後丟給 Marker 解析成全文。 */
export async function fetchOaPdfText(params: { doi: string | null; pdfUrl: string | null }): Promise<string | null> {
  const pdfUrl = (params.doi ? await findOaPdfUrl(params.doi) : null) ?? params.pdfUrl;
  if (!pdfUrl) return null;

  const res = await fetch(pdfUrl);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return parsePdfToMarkdown(buffer);
}
