import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge", "judge2", "judge3"];

let originalConfig: string | null = null;

// 全座位指到 mock provider：審查 e2e 全程零額度
test.beforeAll(() => {
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'llm_config'`).get() as
    | { value: string }
    | undefined;
  originalConfig = row?.value ?? null;
  const config = {
    providers: [{ id: "mock-e2e", kind: "mock", label: "Mock E2E", models: ["mock-1"] }],
    seats: Object.fromEntries(SEATS.map((s) => [s, { providerId: "mock-e2e", model: "mock-1" }])),
  };
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('llm_config', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(config));
  db.close();
});

test.afterAll(() => {
  const db = new Database(DB_PATH);
  if (originalConfig === null) {
    db.prepare(`DELETE FROM settings WHERE key = 'llm_config'`).run();
  } else {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('llm_config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(originalConfig);
  }
  db.close();
});

test("審查：API 產生 scorecard、UI 顯示五維分數與爭點", async ({ page, request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "litereview 審查測試論文",
        abstract: "這是一篇用於 e2e 測試的論文摘要，內容描述一個假想的方法與實驗結果。",
        year: 2026,
        authors: ["Test Author"],
        arxivId: null,
        doi: null,
        pdfUrl: null,
        citationCount: null,
        source: "openalex",
        venue: null,
        issn: null,
      },
    },
  });
  const { id } = await created.json();

  // POST 審查（內部先跑 mock 找重點，再跑 mock 審查）；forceRefresh 避免吃到舊 schema 的快取審查
  const res = await request
    .post(`${BASE_URL}/api/review/${id}`, { data: { forceRefresh: true } })
    .then((r) => r.json());
  expect(res.status).toBe("done");
  expect(res.review.data.scores.methodological_rigor.score).toBeGreaterThanOrEqual(1);
  expect(res.review.data.motions.length).toBeGreaterThan(0);
  expect(res.review.seatInfo).toContain("Mock E2E");
  // v1.7 批判檢核：五問 verdict + 限制落差
  expect(res.review.data.critical_checklist.sample_adequacy.verdict).toBe("partial");
  expect(res.review.data.critical_checklist.limitations_acknowledged.verdict).toBe("fail");
  expect(res.review.data.unacknowledged_limitations.length).toBeGreaterThan(0);

  // GET 拿存檔
  const saved = await request.get(`${BASE_URL}/api/review/${id}`).then((r) => r.json());
  expect(saved.review.data.strengths.length).toBeGreaterThan(0);

  // UI：切到審查籤看 scorecard
  await page.goto(`${BASE_URL}/workspace/${id}`);
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "審查" }).click();
  await expect(main.getByText("方法嚴謹度")).toBeVisible({ timeout: 15000 });
  await expect(main.getByText("證據強度")).toBeVisible();
  await expect(main.getByText("可重現性")).toBeVisible();
  // v1.7 批判檢核區：五問標題 + verdict 徽章 + 限制落差
  await expect(main.getByText("批判檢核")).toBeVisible();
  await expect(main.getByText("樣本量足以支撐結論")).toBeVisible();
  await expect(main.getByText("作者未承認的限制")).toBeVisible();
  await expect(main.getByText("發起辯論").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/review-scorecard.png", fullPage: true });

  await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
});
