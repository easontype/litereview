import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const FAKE_JOURNAL = "Litereview Test Journal Of Excellence";
const FAKE_ISSN = "99998888";

// 直接播種 journal_ranks（WAL 模式允許跨 process 寫入），不依賴 fetch:rankings 是否跑過
test.beforeAll(() => {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_ranks (
      issn TEXT, title TEXT, title_norm TEXT, kind TEXT,
      sjr_quartile TEXT, sjr_score REAL, core_rank TEXT, source_year INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_journal_ranks_issn ON journal_ranks(issn);
    CREATE INDEX IF NOT EXISTS idx_journal_ranks_title_norm ON journal_ranks(title_norm);
  `);
  db.prepare("DELETE FROM journal_ranks WHERE issn = ?").run(FAKE_ISSN);
  db.prepare(
    `INSERT INTO journal_ranks (issn, title, title_norm, kind, sjr_quartile, sjr_score, core_rank, source_year)
     VALUES (?, ?, ?, 'journal', 'Q1', 9.9, NULL, 2026)`
  ).run(FAKE_ISSN, FAKE_JOURNAL, "litereview test journal of excellence");
  db.close();
});

test.afterAll(() => {
  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM journal_ranks WHERE issn = ?").run(FAKE_ISSN);
  db.close();
});

test("分級徽章：帶 ISSN 的工作區論文顯示 Q1", async ({ page, request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "litereview 分級徽章測試論文",
        abstract: "",
        year: 2026,
        authors: [],
        arxivId: null,
        doi: null,
        pdfUrl: null,
        citationCount: null,
        source: "openalex",
        venue: FAKE_JOURNAL,
        issn: "9999-8888",
      },
    },
  });
  const { id } = await created.json();

  const list = await request.get(`${BASE_URL}/api/workspace/papers`).then((r) => r.json());
  const item = list.items.find((it: { id: string }) => it.id === id);
  expect(item.rank?.sjrQuartile).toBe("Q1");

  await page.goto(`${BASE_URL}/workspace`);
  const row = page.locator("main li", { hasText: "litereview 分級徽章測試論文" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Q1", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/rank-badge.png", fullPage: true });

  await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
});

test("/journals 查詢頁：查 nature 顯示結果與品質信號", async ({ page }) => {
  await page.goto(`${BASE_URL}/journals`);
  await page.getByPlaceholder(/Nature/).fill("nature");
  await page.getByRole("button", { name: "查詢" }).click();

  const main = page.locator("main");
  await expect(main.getByText(/筆結果/)).toBeVisible({ timeout: 15000 });
  await expect(main.locator("li").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/journals.png", fullPage: true });
});
