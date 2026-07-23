/**
 * Zotero 7 本機 API（http://localhost:23119/api，Web API 的唯讀子集）。
 * 需要 Zotero 桌面版開啟，且「允許本機其他應用程式與 Zotero 通訊」設定為開（預設開）。
 */

// 127.0.0.1 explicitly: Zotero's local API listens on IPv4 only, while Node 17+
// on Windows may resolve `localhost` to ::1 first and hang the connection.
const BASE = "http://127.0.0.1:23119/api/users/0";
const PAGE_SIZE = 100;
const MAX_ITEMS = 500;

interface ZoteroCreator {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

interface ZoteroItemEnvelope {
  key: string;
  data: {
    key: string;
    itemType: string;
    title?: string;
    creators?: ZoteroCreator[];
    abstractNote?: string;
    DOI?: string;
    date?: string;
    publicationTitle?: string;
    proceedingsTitle?: string;
    conferenceName?: string;
    url?: string;
    archiveID?: string;
    extra?: string;
    ISSN?: string;
  };
}

interface ZoteroCollectionEnvelope {
  key: string;
  meta?: { numItems?: number };
  data: { key: string; name: string; parentCollection?: string | false };
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentKey: string | null;
  numItems: number;
}

/** 匯入流程在前端與 /api/zotero/import 之間傳遞的條目形狀。 */
export interface ZoteroImportItem {
  zoteroKey: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string;
  venue: string | null;
  issn: string | null;
  itemType: string;
}

function localFetch(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(3000) });
}

export async function zoteroRunning(): Promise<boolean> {
  try {
    const res = await localFetch("/collections?limit=1");
    return res.ok;
  } catch {
    return false;
  }
}

export async function listCollections(): Promise<ZoteroCollection[]> {
  const collections: ZoteroCollection[] = [];
  let start = 0;
  for (;;) {
    const res = await localFetch(`/collections?format=json&limit=${PAGE_SIZE}&start=${start}`);
    if (!res.ok) throw new Error(`Zotero 本機 API 回應 ${res.status}`);
    const page = (await res.json()) as ZoteroCollectionEnvelope[];
    for (const c of page) {
      collections.push({
        key: c.key,
        name: c.data.name,
        parentKey: c.data.parentCollection || null,
        numItems: c.meta?.numItems ?? 0,
      });
    }
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return collections;
}

const NON_PAPER_TYPES = new Set(["attachment", "note", "annotation"]);

/** collectionKey 傳 "all" 時列出整個文庫的頂層條目。 */
export async function listCollectionItems(collectionKey: string): Promise<ZoteroImportItem[]> {
  const prefix = collectionKey === "all" ? "" : `/collections/${encodeURIComponent(collectionKey)}`;
  const items: ZoteroImportItem[] = [];
  let start = 0;
  while (items.length < MAX_ITEMS) {
    const res = await localFetch(`${prefix}/items/top?format=json&limit=${PAGE_SIZE}&start=${start}`);
    if (!res.ok) throw new Error(`Zotero 本機 API 回應 ${res.status}`);
    const page = (await res.json()) as ZoteroItemEnvelope[];
    for (const envelope of page) {
      if (NON_PAPER_TYPES.has(envelope.data.itemType)) continue;
      items.push(mapItem(envelope));
    }
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return items;
}

function mapItem(envelope: ZoteroItemEnvelope): ZoteroImportItem {
  const d = envelope.data;
  return {
    zoteroKey: envelope.key,
    title: d.title ?? "",
    authors: (d.creators ?? [])
      .filter((c) => !c.creatorType || c.creatorType === "author")
      .map((c) => c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" "))
      .filter(Boolean),
    year: extractYear(d.date),
    doi: cleanDoi(d.DOI),
    arxivId: extractArxivId(d),
    abstract: d.abstractNote ?? "",
    venue: d.publicationTitle ?? d.proceedingsTitle ?? d.conferenceName ?? null,
    issn: d.ISSN?.split(",")[0]?.trim() ?? null,
    itemType: d.itemType,
  };
}

function extractYear(date?: string): number | null {
  const m = /\b(19|20)\d{2}\b/.exec(date ?? "");
  return m ? Number(m[0]) : null;
}

function cleanDoi(doi?: string): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/doi\.org\//i, "").trim() || null;
}

/** Zotero 條目常見的 arXiv ID 位置：archiveID（"arXiv:2101.00027"）、url、extra。 */
function extractArxivId(d: ZoteroItemEnvelope["data"]): string | null {
  for (const field of [d.archiveID, d.url, d.extra]) {
    if (!field) continue;
    const m = /arxiv(?::|\.org\/(?:abs|pdf)\/)\s*(\d{4}\.\d{4,5})/i.exec(field);
    if (m) return m[1];
  }
  return null;
}
