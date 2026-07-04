/**
 * 下載期刊/會議分級資料並匯入本機 SQLite（journal_ranks 表）：
 *   - Scimago SJR（期刊 Q1–Q4）：https://www.scimagojr.com
 *   - CORE（資訊領域會議 A*、A、B、C）：https://portal.core.edu.au
 *
 * 用法：npm run fetch:rankings
 * 網址失效時：手動下載 CSV 放到 data/rankings/（sjr.csv / core.csv）再重跑本指令。
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DATA_DIR = path.join(process.cwd(), "data");
const RANK_DIR = path.join(DATA_DIR, "rankings");
const DB_PATH = path.join(DATA_DIR, "litereview.db");

const SJR_URL = "https://www.scimagojr.com/journalrank.php?out=xls";
const CORE_URL =
  "https://portal.core.edu.au/conf-ranks/?search=&by=all&source=CORE2023&sort=atitle&page=1&do=Export";

const SJR_CSV = path.join(RANK_DIR, "sjr.csv");
const CORE_CSV = path.join(RANK_DIR, "core.csv");

fs.mkdirSync(RANK_DIR, { recursive: true });

function normIssn(issn) {
  return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normTitle(title) {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 支援引號與跳脫的簡易 CSV 解析。 */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Scimago 的 Cloudflare 會用 TLS 指紋擋 Node fetch（403），失敗時改用系統 curl 重試。 */
function downloadViaCurl(url, label, previousError) {
  try {
    return execFileSync("curl", ["-sS", "--fail", "-A", BROWSER_UA, "--max-time", "180", url], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    throw new Error(`${label} 下載失敗（fetch：${previousError.message}；curl 重試也失敗）`);
  }
}

async function download(url, dest, label) {
  process.stdout.write(`下載 ${label}…`);
  let text;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    text = downloadViaCurl(url, label, err);
  }
  if (text.length < 1000) throw new Error(`${label} 回應太短，格式可能已變`);
  fs.writeFileSync(dest, text, "utf8");
  console.log(` 完成（${(text.length / 1024 / 1024).toFixed(1)} MB）`);
  return text;
}

async function loadCsv(url, dest, label) {
  if (fs.existsSync(dest)) {
    console.log(`使用既有檔案 ${path.relative(process.cwd(), dest)}（要重新下載請先刪除它）`);
    return fs.readFileSync(dest, "utf8");
  }
  try {
    return await download(url, dest, label);
  } catch (err) {
    console.error(`\n${label} 下載失敗：${err.message}`);
    console.error(`手動救援：從 ${url.split("?")[0]} 下載 CSV 存成 ${dest} 後重跑本指令。`);
    return null;
  }
}

function ingestSjr(db, text) {
  const rows = parseCsv(text, ";");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iTitle = col("title");
  const iType = col("type");
  const iIssn = col("issn");
  const iSjr = col("sjr");
  const iQuartile = col("sjr best quartile");
  if (iTitle < 0 || iIssn < 0 || iQuartile < 0) {
    throw new Error(`SJR CSV 欄位對不上（實際 header：${header.slice(0, 10).join(";")}…）`);
  }

  const insert = db.prepare(
    `INSERT INTO journal_ranks (issn, title, title_norm, kind, sjr_quartile, sjr_score, core_rank, source_year)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
  );
  const year = new Date().getFullYear();
  let count = 0;
  const insertAll = db.transaction(() => {
    // 只覆蓋 SJR 自己的列;CORE 列(core_rank NOT NULL)不動
    db.prepare("DELETE FROM journal_ranks WHERE sjr_quartile IS NOT NULL").run();
    for (const row of rows.slice(1)) {
      const title = row[iTitle]?.trim();
      const quartile = row[iQuartile]?.trim();
      if (!title || !/^Q[1-4]$/.test(quartile)) continue;
      const kind = (row[iType] ?? "").includes("conference") ? "conference" : "journal";
      const score = iSjr >= 0 ? Number((row[iSjr] ?? "").replace(",", ".")) || null : null;
      const issns = (row[iIssn] ?? "")
        .split(",")
        .map((s) => normIssn(s))
        .filter((s) => s.length === 8);
      const titleNorm = normTitle(title);
      if (issns.length === 0) {
        insert.run(null, title, titleNorm, kind, quartile, score, year);
        count++;
      } else {
        for (const issn of issns) {
          insert.run(issn, title, titleNorm, kind, quartile, score, year);
          count++;
        }
      }
    }
  });
  insertAll();
  return count;
}

function ingestCore(db, text) {
  // CORE export 沒有 header：id, title, acronym, source, rank, …
  const rows = parseCsv(text, ",");
  const valid = new Set(["A*", "A", "B", "C"]);
  const insert = db.prepare(
    `INSERT INTO journal_ranks (issn, title, title_norm, kind, sjr_quartile, sjr_score, core_rank, source_year)
     VALUES (NULL, ?, ?, 'conference', NULL, NULL, ?, ?)`
  );
  const year = 2023;
  let count = 0;
  const insertAll = db.transaction(() => {
    // 只覆蓋 CORE 自己的列;SJR 列(sjr_quartile NOT NULL)不動
    db.prepare("DELETE FROM journal_ranks WHERE core_rank IS NOT NULL").run();
    for (const row of rows) {
      const [, title, acronym, , rank] = row.map((f) => (f ?? "").trim());
      if (!title || !valid.has(rank)) continue;
      insert.run(title, normTitle(title), rank, year);
      count++;
      if (acronym && acronym.length >= 3) {
        insert.run(`${title}（${acronym}）`, normTitle(acronym), rank, year);
        count++;
      }
    }
  });
  insertAll();
  return count;
}

const sjrText = await loadCsv(SJR_URL, SJR_CSV, "Scimago SJR 期刊分級");
const coreText = await loadCsv(CORE_URL, CORE_CSV, "CORE 會議分級");

if (!sjrText && !coreText) {
  console.error("兩個資料源都拿不到，未更動資料庫。");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS journal_ranks (
    issn TEXT, title TEXT, title_norm TEXT, kind TEXT,
    sjr_quartile TEXT, sjr_score REAL, core_rank TEXT, source_year INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_journal_ranks_issn ON journal_ranks(issn);
  CREATE INDEX IF NOT EXISTS idx_journal_ranks_title_norm ON journal_ranks(title_norm);
`);

const results = [
  { label: "SJR 期刊分級", text: sjrText, ingest: ingestSjr },
  { label: "CORE 會議分級", text: coreText, ingest: ingestCore },
].map(({ label, text, ingest }) => {
  if (!text) return { label, ok: false, n: 0, reason: "下載失敗（該來源既有資料保留未動）" };
  try {
    const n = ingest(db, text);
    return { label, ok: n > 0, n, reason: n === 0 ? "匯入 0 筆，來源格式可能已變" : null };
  } catch (err) {
    return { label, ok: false, n: 0, reason: err.message };
  }
});
const total = db.prepare("SELECT COUNT(*) AS c FROM journal_ranks").get().c;
db.close();

console.log("");
for (const r of results) {
  if (r.ok) console.log(`✓ ${r.label}：匯入 ${r.n} 筆`);
  else console.error(`⚠ ${r.label}：${r.reason}`);
}
console.log(`journal_ranks 目前共 ${total} 筆。搜尋/工作區的分級徽章即會顯示。`);
if (results.some((r) => !r.ok)) {
  console.error("有資料來源未成功匯入——分級資料不完整，請依上方訊息救援後重跑。");
  process.exit(1);
}
