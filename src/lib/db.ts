import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import type { PaperResult } from "./scholarly/types";
import type { KeypointsData } from "./keypoints/parse";
import type { CompareData } from "./compare/parse";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "litereview.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT,
      abstract TEXT,
      authors TEXT,
      year INTEGER,
      arxiv_id TEXT,
      doi TEXT,
      pdf_url TEXT,
      source TEXT,
      venue TEXT,
      citation_count INTEGER,
      openalex_2yr_citedness REAL,
      openalex_h_index INTEGER,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workspace_items (
      paper_id TEXT REFERENCES papers(id),
      added_at TEXT,
      PRIMARY KEY (paper_id)
    );

    CREATE TABLE IF NOT EXISTS keypoints (
      paper_id TEXT REFERENCES papers(id) PRIMARY KEY,
      fulltext_source TEXT,
      research_question TEXT,
      methodology TEXT,
      key_findings TEXT,
      data_experiments TEXT,
      contributions TEXT,
      limitations TEXT,
      novelty_rating TEXT,
      novelty_reason TEXT,
      raw_json TEXT,
      analyzed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      paper_ids TEXT,
      result_json TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_ranks (
      issn TEXT,
      title TEXT,
      title_norm TEXT,
      kind TEXT,
      sjr_quartile TEXT,
      sjr_score REAL,
      core_rank TEXT,
      source_year INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_journal_ranks_issn ON journal_ranks(issn);
    CREATE INDEX IF NOT EXISTS idx_journal_ranks_title_norm ON journal_ranks(title_norm);
  `);

  ensureColumn("papers", "zotero_key", "TEXT");
  ensureColumn("papers", "issn", "TEXT");
  ensureColumn("keypoints", "zotero_note_key", "TEXT");
}

/** 輕量 migration：欄位不存在時 ALTER TABLE 補上（better-sqlite3 無 IF NOT EXISTS for columns）。 */
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

ensureSchema();

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export interface WorkspaceItem {
  id: string;
  title: string;
  source: string;
  arxivId: string | null;
  doi: string | null;
  addedAt: string;
  hasKeypoints: boolean;
  fulltextSource: string | null;
  zoteroKey: string | null;
  venue: string | null;
  issn: string | null;
}

/** 論文的去重鍵：優先用 arXiv ID，其次 DOI，最後標題（與 Phase 1 搜尋結果去重邏輯一致）。 */
function paperKey(paper: Pick<PaperResult, "arxivId" | "doi" | "title">): string {
  return paper.arxivId ?? paper.doi ?? paper.title;
}

/** 用去重鍵的 hash 當 id，避免 DOI 裡的 "/" 破壞 API 路由。 */
function paperIdFromKey(key: string): string {
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/** 依 arxivId ?? doi ?? title 判斷論文是否已存在，回傳（新建或既有的）id。 */
export function upsertPaper(paper: PaperResult): string {
  const id = paperIdFromKey(paperKey(paper));
  const existing = db.prepare("SELECT id FROM papers WHERE id = ?").get(id);
  if (!existing) {
    db.prepare(
      `INSERT INTO papers (id, title, abstract, authors, year, arxiv_id, doi, pdf_url, source, venue, issn, citation_count, openalex_2yr_citedness, openalex_h_index, created_at)
       VALUES (@id, @title, @abstract, @authors, @year, @arxivId, @doi, @pdfUrl, @source, @venue, @issn, @citationCount, @twoYearCitedness, @hIndex, @createdAt)`
    ).run({
      id,
      title: paper.title,
      abstract: paper.abstract,
      authors: JSON.stringify(paper.authors),
      year: paper.year,
      arxivId: paper.arxivId,
      doi: paper.doi,
      pdfUrl: paper.pdfUrl,
      source: paper.source,
      venue: paper.venue ?? null,
      issn: paper.issn ?? null,
      citationCount: paper.citationCount,
      twoYearCitedness: paper.quality?.twoYearCitedness ?? null,
      hIndex: paper.quality?.hIndex ?? null,
      createdAt: new Date().toISOString(),
    });
  }
  return id;
}

/** 對外暴露去重 id 計算（Zotero 匯入等入口用來判斷論文是否已在庫）。 */
export function paperIdFor(paper: Pick<PaperResult, "arxivId" | "doi" | "title">): string {
  return paperIdFromKey(paperKey(paper));
}

export function isInWorkspace(paperId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM workspace_items WHERE paper_id = ?").get(paperId));
}

export function setZoteroKey(paperId: string, zoteroKey: string) {
  db.prepare("UPDATE papers SET zotero_key = ? WHERE id = ?").run(zoteroKey, paperId);
}

export function getZoteroNoteKey(paperId: string): string | null {
  const row = db.prepare("SELECT zotero_note_key FROM keypoints WHERE paper_id = ?").get(paperId) as
    | { zotero_note_key: string | null }
    | undefined;
  return row?.zotero_note_key ?? null;
}

export function setZoteroNoteKey(paperId: string, noteKey: string) {
  db.prepare("UPDATE keypoints SET zotero_note_key = ? WHERE paper_id = ?").run(noteKey, paperId);
}

/** 使用者直接上傳 PDF 建立的論文：無 arXiv/DOI，去重鍵不適用，id 用標題+時間戳雜湊避免碰撞。 */
export function createUploadedPaper(title: string): string {
  const id = createHash("sha1").update(`upload:${title}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16);
  db.prepare(
    `INSERT INTO papers (id, title, abstract, authors, year, arxiv_id, doi, pdf_url, source, venue, citation_count, openalex_2yr_citedness, openalex_h_index, created_at)
     VALUES (@id, @title, '', '[]', NULL, NULL, NULL, NULL, 'upload', NULL, NULL, NULL, NULL, @createdAt)`
  ).run({ id, title, createdAt: new Date().toISOString() });
  addToWorkspace(id);
  return id;
}

export function addToWorkspace(paperId: string) {
  db.prepare(
    "INSERT INTO workspace_items (paper_id, added_at) VALUES (?, ?) ON CONFLICT(paper_id) DO NOTHING"
  ).run(paperId, new Date().toISOString());
}

export function removeFromWorkspace(paperId: string) {
  db.prepare("DELETE FROM workspace_items WHERE paper_id = ?").run(paperId);
}

export function listWorkspace(): WorkspaceItem[] {
  const rows = db
    .prepare(
      `SELECT p.id as id, p.title as title, p.source as source, p.arxiv_id as arxivId, p.doi as doi,
              p.zotero_key as zoteroKey, p.venue as venue, p.issn as issn,
              w.added_at as addedAt, (k.paper_id IS NOT NULL) as hasKeypoints, k.fulltext_source as fulltextSource
       FROM workspace_items w
       JOIN papers p ON p.id = w.paper_id
       LEFT JOIN keypoints k ON k.paper_id = p.id
       ORDER BY w.added_at DESC`
    )
    .all() as Array<Omit<WorkspaceItem, "hasKeypoints"> & { hasKeypoints: number }>;
  return rows.map((r) => ({ ...r, hasKeypoints: Boolean(r.hasKeypoints) }));
}

export interface PaperRow {
  id: string;
  title: string;
  abstract: string;
  arxivId: string | null;
  doi: string | null;
  pdfUrl: string | null;
  zoteroKey: string | null;
}

export function getPaper(id: string): PaperRow | undefined {
  return db
    .prepare(
      `SELECT id, title, abstract, arxiv_id as arxivId, doi, pdf_url as pdfUrl, zotero_key as zoteroKey FROM papers WHERE id = ?`
    )
    .get(id) as PaperRow | undefined;
}

export interface KeypointsRow {
  paperId: string;
  fulltextSource: string;
  researchQuestion: string;
  methodology: string;
  keyFindings: string;
  dataExperiments: string;
  contributions: string;
  limitations: string;
  noveltyRating: string;
  noveltyReason: string;
  keyFormulasOrAlgorithms: string[];
  analyzedAt: string;
}

export function getKeypoints(paperId: string): KeypointsRow | undefined {
  const row = db.prepare(`SELECT paper_id, fulltext_source, raw_json, analyzed_at FROM keypoints WHERE paper_id = ?`).get(paperId) as
    | { paper_id: string; fulltext_source: string; raw_json: string; analyzed_at: string }
    | undefined;
  if (!row) return undefined;
  const data = JSON.parse(row.raw_json) as KeypointsData;
  return {
    paperId: row.paper_id,
    fulltextSource: row.fulltext_source,
    researchQuestion: data.research_question,
    methodology: data.methodology,
    keyFindings: data.key_findings,
    dataExperiments: data.data_experiments,
    contributions: data.contributions,
    limitations: data.limitations,
    noveltyRating: data.novelty_rating,
    noveltyReason: data.novelty_reason,
    keyFormulasOrAlgorithms: data.key_formulas_or_algorithms ?? [],
    analyzedAt: row.analyzed_at,
  };
}

export function saveKeypoints(paperId: string, fulltextSource: string, data: KeypointsData) {
  db.prepare(
    `INSERT INTO keypoints (paper_id, fulltext_source, research_question, methodology, key_findings, data_experiments, contributions, limitations, novelty_rating, novelty_reason, raw_json, analyzed_at)
     VALUES (@paperId, @fulltextSource, @researchQuestion, @methodology, @keyFindings, @dataExperiments, @contributions, @limitations, @noveltyRating, @noveltyReason, @rawJson, @analyzedAt)
     ON CONFLICT(paper_id) DO UPDATE SET
       fulltext_source = excluded.fulltext_source,
       research_question = excluded.research_question,
       methodology = excluded.methodology,
       key_findings = excluded.key_findings,
       data_experiments = excluded.data_experiments,
       contributions = excluded.contributions,
       limitations = excluded.limitations,
       novelty_rating = excluded.novelty_rating,
       novelty_reason = excluded.novelty_reason,
       raw_json = excluded.raw_json,
       analyzed_at = excluded.analyzed_at`
  ).run({
    paperId,
    fulltextSource,
    researchQuestion: data.research_question,
    methodology: data.methodology,
    keyFindings: data.key_findings,
    dataExperiments: data.data_experiments,
    contributions: data.contributions,
    limitations: data.limitations,
    noveltyRating: data.novelty_rating,
    noveltyReason: data.novelty_reason,
    rawJson: JSON.stringify(data),
    analyzedAt: new Date().toISOString(),
  });
}

export interface ComparisonListItem {
  id: string;
  paperIds: string[];
  titles: string[];
  createdAt: string;
}

export function listComparisons(): ComparisonListItem[] {
  const rows = db
    .prepare(`SELECT id, paper_ids, created_at FROM comparisons ORDER BY created_at DESC`)
    .all() as Array<{ id: string; paper_ids: string; created_at: string }>;
  const titleStmt = db.prepare(`SELECT title FROM papers WHERE id = ?`);
  return rows.map((r) => {
    const paperIds = JSON.parse(r.paper_ids) as string[];
    const titles = paperIds.map((pid) => (titleStmt.get(pid) as { title: string } | undefined)?.title ?? pid);
    return { id: r.id, paperIds, titles, createdAt: r.created_at };
  });
}

export interface ComparisonRow extends CompareData {
  id: string;
  paperIds: string[];
  titles: string[];
  createdAt: string;
}

export function getComparison(id: string): ComparisonRow | undefined {
  const row = db
    .prepare(`SELECT id, paper_ids, result_json, created_at FROM comparisons WHERE id = ?`)
    .get(id) as { id: string; paper_ids: string; result_json: string; created_at: string } | undefined;
  if (!row) return undefined;
  const paperIds = JSON.parse(row.paper_ids) as string[];
  const titleStmt = db.prepare(`SELECT title FROM papers WHERE id = ?`);
  const titles = paperIds.map((pid) => (titleStmt.get(pid) as { title: string } | undefined)?.title ?? pid);
  return { id: row.id, paperIds, titles, createdAt: row.created_at, ...(JSON.parse(row.result_json) as CompareData) };
}

export function saveComparison(paperIds: string[], result: CompareData): string {
  const id = createHash("sha1").update(paperIds.join(",") + Date.now()).digest("hex").slice(0, 16);
  db.prepare(
    `INSERT INTO comparisons (id, paper_ids, result_json, created_at) VALUES (@id, @paperIds, @resultJson, @createdAt)`
  ).run({
    id,
    paperIds: JSON.stringify(paperIds),
    resultJson: JSON.stringify(result),
    createdAt: new Date().toISOString(),
  });
  return id;
}
