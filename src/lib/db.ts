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
  `);
}

ensureSchema();

export interface WorkspaceItem {
  id: string;
  title: string;
  source: string;
  arxivId: string | null;
  doi: string | null;
  addedAt: string;
  hasKeypoints: boolean;
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
      `INSERT INTO papers (id, title, abstract, authors, year, arxiv_id, doi, pdf_url, source, venue, citation_count, openalex_2yr_citedness, openalex_h_index, created_at)
       VALUES (@id, @title, @abstract, @authors, @year, @arxivId, @doi, @pdfUrl, @source, @venue, @citationCount, @twoYearCitedness, @hIndex, @createdAt)`
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
      citationCount: paper.citationCount,
      twoYearCitedness: paper.quality?.twoYearCitedness ?? null,
      hIndex: paper.quality?.hIndex ?? null,
      createdAt: new Date().toISOString(),
    });
  }
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
              w.added_at as addedAt, (k.paper_id IS NOT NULL) as hasKeypoints
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
}

export function getPaper(id: string): PaperRow | undefined {
  return db
    .prepare(
      `SELECT id, title, abstract, arxiv_id as arxivId, doi, pdf_url as pdfUrl FROM papers WHERE id = ?`
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
