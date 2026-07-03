import { db } from "@/lib/db";

export interface JournalRank {
  sjrQuartile: string | null;
  coreRank: string | null;
  matchedTitle: string | null;
}

/** 正規化 ISSN：去連字號、大寫（SJR CSV 與 OpenAlex issn_l 格式不同）。 */
export function normIssn(issn: string): string {
  return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** 正規化期刊/會議名稱供比對：小寫、& → and、去符號。 */
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let hasDataCache = false;

/** journal_ranks 是否已匯入資料（未跑 fetch:rankings 時 UI 優雅降級）。只快取正向結果，匯入後不用重啟。 */
export function rankingsAvailable(): boolean {
  if (!hasDataCache) {
    hasDataCache = Boolean(db.prepare("SELECT 1 FROM journal_ranks LIMIT 1").get());
  }
  return hasDataCache;
}

interface RankRow {
  title: string;
  sjr_quartile: string | null;
  core_rank: string | null;
}

/**
 * 先用 ISSN 精準比對，其次正規化名稱完全一致（不做模糊比對，避免掛錯徽章）。
 * SJR（期刊）與 CORE（會議）分開比對——同一個會議可能兩邊都有分級。
 */
export function getRank(issn?: string | null, venue?: string | null): JournalRank | null {
  if (!rankingsAvailable()) return null;

  let sjrRow: RankRow | undefined;
  if (issn) {
    sjrRow = db
      .prepare(
        "SELECT title, sjr_quartile, core_rank FROM journal_ranks WHERE issn = ? AND sjr_quartile IS NOT NULL LIMIT 1"
      )
      .get(normIssn(issn)) as RankRow | undefined;
  }
  if (!sjrRow && venue) {
    sjrRow = db
      .prepare(
        "SELECT title, sjr_quartile, core_rank FROM journal_ranks WHERE title_norm = ? AND sjr_quartile IS NOT NULL LIMIT 1"
      )
      .get(normTitle(venue)) as RankRow | undefined;
  }

  let coreRow: RankRow | undefined;
  if (venue) {
    coreRow = db
      .prepare(
        "SELECT title, sjr_quartile, core_rank FROM journal_ranks WHERE title_norm = ? AND core_rank IS NOT NULL LIMIT 1"
      )
      .get(normTitle(venue)) as RankRow | undefined;
  }

  if (!sjrRow && !coreRow) return null;
  return {
    sjrQuartile: sjrRow?.sjr_quartile ?? null,
    coreRank: coreRow?.core_rank ?? null,
    matchedTitle: sjrRow?.title ?? coreRow?.title ?? null,
  };
}

export interface JournalSearchRow {
  title: string;
  issn: string | null;
  kind: string;
  sjrQuartile: string | null;
  sjrScore: number | null;
  coreRank: string | null;
}

/** /journals 頁的本地查詢（LIKE 比對正規化名稱）。 */
export function searchJournalRanks(query: string, limit = 20): JournalSearchRow[] {
  if (!rankingsAvailable()) return [];
  const rows = db
    .prepare(
      `SELECT title, issn, kind, sjr_quartile as sjrQuartile, sjr_score as sjrScore, core_rank as coreRank
       FROM journal_ranks WHERE title_norm LIKE ? ORDER BY sjr_score DESC NULLS LAST LIMIT ?`
    )
    .all(`%${normTitle(query)}%`, limit) as JournalSearchRow[];
  return rows;
}
