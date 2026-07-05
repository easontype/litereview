import type { PaperResult } from "./types";
import { getSourceQualityBatch } from "./openalex-quality";

interface OpenAlexWork {
  title?: string;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]> | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string | null } | null }[];
  doi?: string | null;
  ids?: { doi?: string | null };
  cited_by_count?: number | null;
  best_oa_location?: { pdf_url?: string | null } | null;
  primary_location?: {
    pdf_url?: string | null;
    source?: { id?: string | null; display_name?: string | null; issn_l?: string | null } | null;
  } | null;
  open_access?: { oa_url?: string | null } | null;
}

/** OpenAlex API base：可用 env 覆蓋（e2e 指向本機 fixture server）。 */
export function openAlexBase(): string {
  return process.env.OPENALEX_BASE_URL?.replace(/\/$/, "") || "https://api.openalex.org";
}

function contactParam(): string {
  const email = process.env.CONTACT_EMAIL;
  return email ? `mailto=${encodeURIComponent(email)}` : "";
}

/** 把 OpenAlex 的 abstract_inverted_index 還原成一般文字。 */
export function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined
): string {
  if (!invertedIndex) return "";
  const positions: string[] = [];
  for (const [word, idxs] of Object.entries(invertedIndex)) {
    for (const idx of idxs) positions[idx] = word;
  }
  return positions.join(" ").replace(/\s+/g, " ").trim();
}

function cleanDoi(doi?: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/doi\.org\//i, "");
}

function extractArxivId(work: OpenAlexWork): string | null {
  const doi: string | null | undefined = work.doi ?? work.ids?.doi;
  if (doi) {
    const m = /arxiv\.(\d{4}\.\d{4,5})/i.exec(doi);
    if (m) return m[1];
  }
  const pdfUrl: string | null | undefined =
    work.best_oa_location?.pdf_url ?? work.primary_location?.pdf_url ?? work.open_access?.oa_url;
  if (pdfUrl) {
    const m = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(pdfUrl);
    if (m) return m[1];
  }
  return null;
}

interface MappedWork {
  paper: PaperResult;
  sourceId: string | null;
}

function mapWork(work: OpenAlexWork): MappedWork {
  const sourceId: string | null = work.primary_location?.source?.id ?? null;
  const paper: PaperResult = {
    title: work.title ?? work.display_name ?? "",
    abstract: reconstructAbstract(work.abstract_inverted_index),
    year: work.publication_year ?? null,
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((name): name is string => Boolean(name)),
    arxivId: extractArxivId(work),
    doi: cleanDoi(work.doi ?? work.ids?.doi),
    pdfUrl:
      work.best_oa_location?.pdf_url ?? work.primary_location?.pdf_url ?? work.open_access?.oa_url ?? null,
    citationCount: work.cited_by_count ?? null,
    source: "openalex",
    venue: work.primary_location?.source?.display_name ?? null,
    issn: work.primary_location?.source?.issn_l ?? null,
    quality: null,
  };
  return { paper, sourceId };
}

async function attachQuality(mapped: MappedWork[]): Promise<PaperResult[]> {
  const sourceIds = mapped.map((m) => m.sourceId).filter((id): id is string => Boolean(id));
  const qualityMap = await getSourceQualityBatch(sourceIds);
  return mapped.map(({ paper, sourceId }) => ({
    ...paper,
    quality: sourceId ? qualityMap.get(sourceId) ?? null : null,
  }));
}

export async function searchOpenAlex(query: string, limit: number): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
  });
  const contact = contactParam();
  const res = await fetch(`${openAlexBase()}/works?${params.toString()}${contact ? "&" + contact : ""}`);
  if (!res.ok) throw new Error(`OpenAlex 搜尋失敗: ${res.status}`);

  const json = (await res.json()) as { results?: OpenAlexWork[] };
  const mapped: MappedWork[] = (json.results ?? []).map(mapWork);
  return attachQuality(mapped);
}

/** DOI regex 命中時使用：直接查單一 work。 */
export async function fetchOpenAlexByDoi(doi: string): Promise<PaperResult | null> {
  const contact = contactParam();
  const res = await fetch(`${openAlexBase()}/works/doi:${encodeURIComponent(doi)}${contact ? "?" + contact : ""}`);
  if (!res.ok) return null;

  const work = (await res.json()) as OpenAlexWork;
  const [paper] = await attachQuality([mapWork(work)]);
  return paper;
}

/** 從 OpenAlex 的完整 id URL（"https://openalex.org/W123"）取短 id（"W123"）。 */
export function shortWorkId(idUrl: string): string {
  return idUrl.replace(/^https?:\/\/openalex\.org\//i, "");
}

/**
 * 把論文解析成 OpenAlex work id：DOI 優先，無 DOI 時用 arXiv 的 DataCite DOI
 * （10.48550/arXiv.{id}）查；早期 arXiv 論文（約 2021 前）OpenAlex 沒索引 DataCite DOI，
 * 再退 landing_page_url 精準過濾（恰一筆才收，非模糊比對）。
 * 查不到回 null（呼叫端存快取，避免重辯重查）。
 */
export async function resolveOpenAlexWorkId(input: {
  doi?: string | null;
  arxivId?: string | null;
}): Promise<string | null> {
  const contact = contactParam();
  const doi = input.doi ?? (input.arxivId ? `10.48550/arXiv.${input.arxivId}` : null);
  if (doi) {
    const res = await fetch(
      `${openAlexBase()}/works/doi:${encodeURIComponent(doi)}${contact ? "?" + contact : ""}`
    );
    if (res.ok) {
      const work = (await res.json()) as { id?: string };
      if (work.id) return shortWorkId(work.id);
    }
  }
  if (input.arxivId) {
    // 注意 OpenAlex 存的 arXiv landing page 是 http 而非 https
    const url = `${openAlexBase()}/works?filter=locations.landing_page_url:http://arxiv.org/abs/${input.arxivId}&select=id&per-page=2${contact ? "&" + contact : ""}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as { results?: { id?: string }[] };
      if (json.results?.length === 1 && json.results[0].id) return shortWorkId(json.results[0].id);
    }
  }
  return null;
}
