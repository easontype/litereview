import { getPaper, setPaperOpenAlexId } from "@/lib/db";
import { openAlexBase, reconstructAbstract, resolveOpenAlexWorkId, shortWorkId } from "@/lib/scholarly/openalex";
import { getRank } from "@/lib/rankings/lookup";
import { resolveSeat } from "@/lib/llm/registry";
import type { ExternalEvidenceCard } from "./parse";

/**
 * v1.9 外部證據庫建庫管線（三層過濾）：
 * 1. 引文圖譜檢索（唯一來源，不做關鍵字補充）：每篇取 referenced_works + 被引前 50
 * 2. 期刊分級過濾：只留 Q1/Q2 期刊或 CORE A*、A 會議
 * 3. 相關性過濾：reviewer 座位 LLM 對辯題挑 6–8 篇並給關聯註記
 * 任一步失敗一律回 null（呼叫端降級為「無外部證據」照常辯論），絕不弄失敗整場。
 */

/** referenced_works 取樣上限（多數論文引用 30–60 篇；批次 metadata 每批 50）。 */
const MAX_REFERENCED = 100;
/** 被引清單取樣上限（依 cited_by_count 排序取前 N）。 */
const MAX_CITED_BY = 50;
/** 進相關性過濾 prompt 的候選上限（分級過濾後依共同鄰居/被引數排序截斷，防 prompt 過長）。 */
const MAX_LLM_CANDIDATES = 24;
/** 證據卡全場上限。 */
const MAX_CARDS = 8;
/** 候選摘要進 prompt 的截斷長度（證據卡本身存完整摘要）。 */
const PROMPT_ABSTRACT_MAX_CHARS = 600;

interface CandidateWork {
  workId: string;
  title: string;
  abstract: string;
  venue: string | null;
  year: number | null;
  doi: string | null;
  rank: string;
  citedByCount: number | null;
  /** 與幾篇被辯論文有引文關係（跨論文共同鄰居優先）。 */
  linkedPapers: number;
}

interface OpenAlexWorkLite {
  id?: string;
  title?: string | null;
  display_name?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  publication_year?: number | null;
  doi?: string | null;
  cited_by_count?: number | null;
  referenced_works?: string[];
  primary_location?: {
    source?: { display_name?: string | null; issn_l?: string | null } | null;
  } | null;
}

function contactSuffix(): string {
  const email = process.env.CONTACT_EMAIL;
  return email ? `&mailto=${encodeURIComponent(email)}` : "";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

function cleanDoi(doi?: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/doi\.org\//i, "");
}

/** 分級標籤：SJR Q1/Q2 或 CORE A*、A 才回，其他一律 null（＝濾掉）。 */
function qualifyingRank(issn: string | null, venue: string | null): string | null {
  const rank = getRank(issn, venue);
  if (!rank) return null;
  if (rank.sjrQuartile === "Q1" || rank.sjrQuartile === "Q2") return rank.sjrQuartile;
  if (rank.coreRank === "A*" || rank.coreRank === "A") return rank.coreRank;
  return null;
}

/** 確保論文有 openalex_id（快取優先，解析成功即寫回 papers）。 */
async function ensureOpenAlexId(paperId: string): Promise<string | null> {
  const paper = getPaper(paperId);
  if (!paper) return null;
  if (paper.openalexId) return paper.openalexId;
  const resolved = await resolveOpenAlexWorkId({ doi: paper.doi, arxivId: paper.arxivId });
  if (resolved) setPaperOpenAlexId(paperId, resolved);
  return resolved;
}

/** 批次抓 works metadata（filter=openalex:W1|W2…，每批 ≤50）。 */
async function fetchWorksBatch(workIds: string[]): Promise<OpenAlexWorkLite[]> {
  const out: OpenAlexWorkLite[] = [];
  for (let i = 0; i < workIds.length; i += 50) {
    const batch = workIds.slice(i, i + 50);
    const json = await fetchJson<{ results?: OpenAlexWorkLite[] }>(
      `${openAlexBase()}/works?filter=openalex:${batch.join("|")}&per-page=50${contactSuffix()}`
    );
    if (json?.results) out.push(...json.results);
  }
  return out;
}

/** 相關性過濾 prompt（"external_evidence_selection" 為 mock provider 的判別標記）。 */
function buildRelevancePrompt(motion: string, candidates: CandidateWork[]): string {
  const list = candidates
    .map((c, i) => {
      const meta = [c.venue, c.year ? String(c.year) : null].filter(Boolean).join("・");
      return `${i + 1}. 《${c.title}》（${meta || "出處不詳"}）\n摘要：${c.abstract.slice(0, PROMPT_ABSTRACT_MAX_CHARS)}`;
    })
    .join("\n\n");
  return `你是一場學術辯論的文獻助理。以下是與被辯論文有引文關係的高分期刊/會議文獻，請挑出與辯題最相關、最能作為辯論證據的 6–8 篇（不足 6 篇就全選），並各給一句與辯題的關聯註記。

## 辯題
${motion}

## 候選文獻
${list}

## 輸出格式
只輸出一個 JSON 物件，不要其他文字：
{
  "external_evidence_selection": [
    { "index": <候選編號整數>, "note": "<30 字以內的關聯註記，繁體中文>" }
  ]
}`;
}

/** parse 相關性過濾回應：容錯（壞編號/重複丟棄），失敗回 null 讓呼叫端降級。 */
function parseRelevanceResponse(
  raw: string,
  candidates: CandidateWork[]
): { candidate: CandidateWork; note: string }[] | null {
  try {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const jsonStart = stripped.indexOf("{");
    const jsonEnd = stripped.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as {
      external_evidence_selection?: unknown;
    };
    if (!Array.isArray(parsed.external_evidence_selection)) return null;
    const seen = new Set<number>();
    const picked: { candidate: CandidateWork; note: string }[] = [];
    for (const item of parsed.external_evidence_selection) {
      if (picked.length >= MAX_CARDS) break;
      const idx = (item as { index?: unknown }).index;
      if (typeof idx !== "number" || !Number.isInteger(idx)) continue;
      const candidate = candidates[idx - 1];
      if (!candidate || seen.has(idx)) continue;
      seen.add(idx);
      const note = (item as { note?: unknown }).note;
      picked.push({ candidate, note: typeof note === "string" ? note.slice(0, 80) : "" });
    }
    return picked.length > 0 ? picked : null;
  } catch {
    return null;
  }
}

/**
 * 建外部證據庫。onStage 逐步回報進度（engine 轉成 SSE stage 事件）。
 * 回 null = 建庫失敗/無合格候選，呼叫端降級為無外部證據照常辯論。
 */
export async function buildExternalEvidence(
  motion: string,
  paperIds: string[],
  onStage: (message: string) => void
): Promise<ExternalEvidenceCard[] | null> {
  // 1. 解析 OpenAlex id（快取優先）
  onStage("外部證據庫：解析 OpenAlex ID…");
  const workIds: string[] = [];
  for (const paperId of paperIds) {
    const id = await ensureOpenAlexId(paperId);
    if (id) workIds.push(id);
  }
  if (workIds.length === 0) {
    onStage("外部證據庫：論文無法對應到 OpenAlex，未建成（辯論照常進行）");
    return null;
  }
  const selfIds = new Set(workIds);

  // 2. 引文圖譜檢索：referenced_works + 被引前 50，跨論文去重、共同鄰居優先
  onStage("外部證據庫：檢索引文圖譜…");
  const neighborLinks = new Map<string, number>();
  const addNeighbor = (idUrlOrId: string) => {
    const id = shortWorkId(idUrlOrId);
    if (selfIds.has(id)) return;
    neighborLinks.set(id, (neighborLinks.get(id) ?? 0) + 1);
  };

  const citedByMeta: OpenAlexWorkLite[] = [];
  for (const workId of workIds) {
    const work = await fetchJson<OpenAlexWorkLite>(`${openAlexBase()}/works/${workId}?${contactSuffix().slice(1)}`);
    for (const ref of (work?.referenced_works ?? []).slice(0, MAX_REFERENCED)) addNeighbor(ref);

    const citedBy = await fetchJson<{ results?: OpenAlexWorkLite[] }>(
      `${openAlexBase()}/works?filter=cites:${workId}&sort=cited_by_count:desc&per-page=${MAX_CITED_BY}${contactSuffix()}`
    );
    for (const w of citedBy?.results ?? []) {
      if (!w.id) continue;
      addNeighbor(w.id);
      citedByMeta.push(w);
    }
  }
  if (neighborLinks.size === 0) {
    onStage("外部證據庫：引文圖譜無候選文獻，未建成（辯論照常進行）");
    return null;
  }
  onStage(`外部證據庫：引文圖譜共 ${neighborLinks.size} 篇候選，抓取文獻資料…`);

  // 被引清單已帶 metadata，referenced_works 需要批次補抓
  const haveMeta = new Map<string, OpenAlexWorkLite>();
  for (const w of citedByMeta) if (w.id) haveMeta.set(shortWorkId(w.id), w);
  const missing = [...neighborLinks.keys()].filter((id) => !haveMeta.has(id));
  for (const w of await fetchWorksBatch(missing)) if (w.id) haveMeta.set(shortWorkId(w.id), w);

  // 3. 期刊分級過濾：只留 Q1/Q2、CORE A*/A，且必須有標題與摘要（證據卡的最低要件）
  const ranked: CandidateWork[] = [];
  for (const [id, links] of neighborLinks) {
    const w = haveMeta.get(id);
    if (!w) continue;
    const title = w.title ?? w.display_name ?? "";
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    if (!title || !abstract) continue;
    const source = w.primary_location?.source;
    const rank = qualifyingRank(source?.issn_l ?? null, source?.display_name ?? null);
    if (!rank) continue;
    ranked.push({
      workId: id,
      title,
      abstract,
      venue: source?.display_name ?? null,
      year: w.publication_year ?? null,
      doi: cleanDoi(w.doi),
      rank,
      citedByCount: w.cited_by_count ?? null,
      linkedPapers: links,
    });
  }
  if (ranked.length === 0) {
    onStage("外部證據庫：無 Q1/Q2 或 CORE A*/A 的合格候選，未建成（辯論照常進行）");
    return null;
  }

  // 共同鄰居優先，其次被引數，截斷後進 LLM
  ranked.sort((a, b) => b.linkedPapers - a.linkedPapers || (b.citedByCount ?? 0) - (a.citedByCount ?? 0));
  const candidates = ranked.slice(0, MAX_LLM_CANDIDATES);

  // 4. 相關性過濾（reviewer 座位）
  onStage(`外部證據庫：分級過濾後剩 ${ranked.length} 篇，相關性過濾中…`);
  const seat = resolveSeat("reviewer");
  const raw = await seat.provider.chat(buildRelevancePrompt(motion, candidates), { model: seat.model });
  const picked = parseRelevanceResponse(raw, candidates);
  if (!picked) {
    onStage("外部證據庫：相關性過濾失敗，未建成（辯論照常進行）");
    return null;
  }

  const cards = picked.map(({ candidate, note }, i) => ({
    id: `X${i + 1}`,
    workId: candidate.workId,
    title: candidate.title,
    abstract: candidate.abstract,
    venue: candidate.venue,
    year: candidate.year,
    doi: candidate.doi,
    rank: candidate.rank,
    citedByCount: candidate.citedByCount,
    relevance: note,
  }));
  onStage(`外部證據庫：建成 ${cards.length} 張證據卡`);
  return cards;
}
