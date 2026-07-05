import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge", "judge2", "judge3"];
const MOTION = "e2e 測試辯題：mock 方法的效能提升主要來自資料規模";

let originalConfig: string | null = null;

// 全座位指到 mock provider：辯論 e2e 全程零額度（每回合 150ms 模擬延遲）
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
  db.prepare(`DELETE FROM debates WHERE motion = ?`).run(MOTION);
  db.close();
});

test("辯論：mock 全流程（6 回合 + 判決）+ SSE 事件流 + 逐字稿 UI", async ({ page, request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "litereview 辯論測試論文",
        abstract: "這是一篇用於 e2e 辯論測試的論文摘要，描述一個假想方法在多個資料集上的表現。",
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

  // 發起辯論（1 輪駁論 → 立論×2 + 駁論×2 + 結辯×2 = 6 回合）
  const startRes = await request.post(`${BASE_URL}/api/debate`, {
    data: { motion: MOTION, paperIds: [id], rounds: 1 },
  });
  expect(startRes.ok()).toBe(true);
  const { debateId } = await startRes.json();
  expect(debateId).toBeTruthy();

  // SSE 事件流：讀到 done 事件後串流關閉（驗證 jobs store + SSE endpoint 全鏈路）
  const sse = await request.get(`${BASE_URL}/api/jobs/${debateId}/events`).then((r) => r.text());
  expect(sse).toContain('"type":"turn"');
  expect(sse).toContain('"type":"verdict"');
  expect(sse).toContain('"type":"done"');

  // DB 落檔：6 回合逐字稿 + v1.7 合議判決（未帶 judges 參數 → 預設三裁判）
  const detail = await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json());
  expect(detail.debate.status).toBe("done");
  expect(detail.debate.transcript.length).toBe(6);
  expect(detail.debate.transcript[0]).toMatchObject({ role: "proponent", phase: "opening" });
  expect(detail.debate.verdict.finalWinner).toBe("proponent");
  expect(detail.debate.verdict.judges.length).toBe(3);
  expect(detail.debate.verdict.agreement).toBe("3/3");
  expect(detail.debate.verdict.judges[0].seatInfo).toContain("Mock E2E");
  // 分項總分由程式算：mock rubric (8+7+7+8)/4=7.5 vs (6+5+6+6)/4=5.8
  expect(detail.debate.verdict.judges[0].proponentTotal).toBe(7.5);
  expect(detail.debate.verdict.judges[0].opponentTotal).toBe(5.8);
  // 引文硬指標：mock 發言每回合帶【E1】【E2】→ 每方 3 回合 × 2 次引用、2 條不重複
  expect(detail.debate.verdict.citationStats.proponent).toMatchObject({ total: 6, unique: 2 });

  // 清單 API 有這場
  const list = await request.get(`${BASE_URL}/api/debate`).then((r) => r.json());
  expect(list.debates.some((d: { id: string }) => d.id === debateId)).toBe(true);

  // 逐字稿 UI：氣泡 + 判決卡
  await page.goto(`${BASE_URL}/debate/${debateId}`);
  const main = page.getByRole("main");
  await expect(main.getByText(MOTION)).toBeVisible();
  await expect(main.getByText("正方 · 立論")).toBeVisible();
  await expect(main.getByText("反方 · 結辯")).toBeVisible();
  await expect(main.getByText("合議庭判決")).toBeVisible();
  await expect(main.getByTestId("agreement-badge")).toHaveText(/3\/3 一致/);
  await expect(main.getByText("正方勝出")).toBeVisible();
  await expect(main.getByTestId("judge-verdict")).toHaveCount(3);
  await expect(main.getByTestId("citation-stats")).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/debate-transcript.png", fullPage: true });

  // 發起頁：辯題輸入 + 論文勾選 + 歷史清單
  await page.goto(`${BASE_URL}/debate`);
  await expect(main.getByPlaceholder(/架構創新/)).toBeVisible();
  await expect(main.getByText("歷史辯論")).toBeVisible();
  await expect(main.getByText(MOTION).first()).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/debate-new.png", fullPage: true });

  await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
});
