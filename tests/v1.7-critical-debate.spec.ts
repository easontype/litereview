import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge", "judge2", "judge3"];
const MOTION_SINGLE = "v1.7 e2e 測試辯題：單裁判路徑";

let originalConfig: string | null = null;

// 全座位指到 mock provider：零額度
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
  db.prepare(`DELETE FROM debates WHERE motion = ?`).run(MOTION_SINGLE);
  db.close();
});

test("辯論 v1.7：單裁判路徑（judges: 1）判決卡與聚合", async ({ page, request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "v1.7 單裁判測試論文",
        abstract: "這是一篇用於 v1.7 單裁判 e2e 測試的論文摘要。",
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

  try {
    const startRes = await request.post(`${BASE_URL}/api/debate`, {
      data: { motion: MOTION_SINGLE, paperIds: [id], rounds: 1, judges: 1 },
    });
    expect(startRes.ok()).toBe(true);
    const { debateId } = await startRes.json();

    await expect
      .poll(
        async () =>
          ((await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json())) as {
            debate: { status: string };
          }).debate.status,
        { timeout: 60000 }
      )
      .toBe("done");

    // 單裁判：judges 長度 1、agreement "1/1"、seats 快照沒有 judge2/judge3
    const detail = await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json());
    expect(detail.debate.verdict.judges.length).toBe(1);
    expect(detail.debate.verdict.agreement).toBe("1/1");
    expect(detail.debate.verdict.finalWinner).toBe("proponent");
    expect(detail.debate.seats.judge2).toBeUndefined();

    // UI：單裁判卡（非合議庭標題）、單裁判徽章、分項表
    await page.goto(`${BASE_URL}/debate/${debateId}`);
    const main = page.getByRole("main");
    await expect(main.getByTestId("verdict-v2")).toBeVisible({ timeout: 15000 });
    await expect(main.getByText("裁判判決")).toBeVisible();
    await expect(main.getByTestId("agreement-badge")).toHaveText("單裁判");
    await expect(main.getByText("論點品質").first()).toBeVisible();
    await expect(main.getByTestId("judge-verdict")).toHaveCount(1);
    await page.screenshot({ path: "test-results/screenshots/v1.7-single-judge.png", fullPage: true });
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
  }
});

test("舊判決紀錄降級：v1.6 shape 走 legacy 判決卡", async ({ page }) => {
  const legacyId = `lgcy${Date.now().toString(36)}`;
  const db = new Database(DB_PATH);
  db.prepare(
    `INSERT INTO debates (id, motion, paper_ids, seats_json, transcript_json, verdict_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'done', ?)`
  ).run(
    legacyId,
    "v1.7 降級測試：舊判決紀錄",
    JSON.stringify(["legacy-paper-1"]),
    JSON.stringify({ proponent: "Legacy · m", opponent: "Legacy · m", judge: "Legacy · m" }),
    JSON.stringify([
      { role: "proponent", phase: "opening", seatInfo: "Legacy · m", content: "舊紀錄正方立論內容" },
      { role: "opponent", phase: "closing", seatInfo: "Legacy · m", content: "舊紀錄反方結辯內容" },
    ]),
    JSON.stringify({
      winner: "opponent",
      proponentScore: 5,
      opponentScore: 7,
      reasoning: "舊紀錄判決理由",
      seatInfo: "Legacy · m",
    }),
    new Date().toISOString()
  );
  db.close();

  try {
    await page.goto(`${BASE_URL}/debate/${legacyId}`);
    const main = page.getByRole("main");
    await expect(main.getByText("舊紀錄正方立論內容")).toBeVisible();
    // legacy 卡：標題「裁判判決」、勝方與理由照舊；不渲染 v2 卡
    await expect(main.getByText("裁判判決")).toBeVisible();
    await expect(main.getByText("反方勝出")).toBeVisible();
    await expect(main.getByText("舊紀錄判決理由")).toBeVisible();
    await expect(main.getByTestId("verdict-v2")).toHaveCount(0);
  } finally {
    const cleanup = new Database(DB_PATH);
    cleanup.prepare(`DELETE FROM debates WHERE id = ?`).run(legacyId);
    cleanup.close();
  }
});
