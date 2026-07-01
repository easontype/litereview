import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

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
