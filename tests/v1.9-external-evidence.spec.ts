import { test, expect, type APIRequestContext } from "@playwright/test";
import Database from "better-sqlite3";
import http from "node:http";
import path from "node:path";

/**
 * v1.9 外部證據庫 e2e：mock 座位 + 本機 OpenAlex fixture server。
 * 跑這支 spec（與全套）時 Next server 必須以 OPENALEX_BASE_URL=http://localhost:3947 啟動，
 * 否則建庫會打真 OpenAlex（用的是假 DOI，只會查無資料而降級，不會弄髒資料，但測試會 fail）。
 */

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");
const FIXTURE_PORT = 3947;

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge", "judge2", "judge3"];
const MOTION = "v1.9 e2e 測試辯題：外部證據庫建庫與引用";
const MOTION_DEGRADE = "v1.9 e2e 測試辯題：建庫失敗降級";
const TEST_DOI = "10.9999/lr-v19-test";
const TEST_ISSN = "99999999";

/** OpenAlex fixture：解析 DOI → W900；W900 引用 W101/W102、被 W103 引用。 */
function fixtureWork(id: string, title: string, abstractWords: string[], citedBy: number) {
  return {
    id: `https://openalex.org/${id}`,
    title,
    abstract_inverted_index: Object.fromEntries(abstractWords.map((w, i) => [w, [i]])),
    publication_year: 2024,
    doi: `https://doi.org/10.1000/${id.toLowerCase()}`,
    cited_by_count: citedBy,
    primary_location: { source: { display_name: "Mock Journal of Testing", issn_l: "9999-9999" } },
  };
}

let fixtureServer: http.Server;
let resolveCalls = 0;
let originalConfig: string | null = null;

test.beforeAll(async () => {
  // 1. fixture server
  fixtureServer = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? "");
    res.setHeader("Content-Type", "application/json");
    const send = (body: unknown) => res.end(JSON.stringify(body));

    if (url.startsWith(`/works/doi:${TEST_DOI}`)) {
      resolveCalls += 1;
      return send({ id: "https://openalex.org/W900" });
    }
    if (url.startsWith("/works/doi:")) {
      // 降級測試用的未知 DOI：查無資料
      res.statusCode = 404;
      return send({ error: "not found" });
    }
    if (url.startsWith("/works/W900")) {
      return send({
        id: "https://openalex.org/W900",
        referenced_works: ["https://openalex.org/W101", "https://openalex.org/W102"],
      });
    }
    if (url.includes("filter=cites:W900")) {
      return send({
        results: [fixtureWork("W103", "External Candidate Three", ["Mock", "abstract", "three."], 800)],
      });
    }
    if (url.includes("filter=openalex:")) {
      return send({
        results: [
          fixtureWork("W101", "External Candidate One", ["Mock", "abstract", "one."], 500),
          fixtureWork("W102", "External Candidate Two", ["Mock", "abstract", "two."], 300),
        ],
      });
    }
    res.statusCode = 404;
    send({ error: "unhandled fixture route: " + url });
  });
  await new Promise<void>((resolve) => fixtureServer.listen(FIXTURE_PORT, resolve));

  // 2. 全座位 mock + 播種 Q1 期刊分級列
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
  db.prepare(`DELETE FROM journal_ranks WHERE issn = ?`).run(TEST_ISSN);
  db.prepare(
    `INSERT INTO journal_ranks (issn, title, title_norm, kind, sjr_quartile, sjr_score, core_rank, source_year)
     VALUES (?, 'Mock Journal of Testing', 'mock journal of testing', 'journal', 'Q1', 5.0, NULL, 2026)`
  ).run(TEST_ISSN);
  db.close();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  const db = new Database(DB_PATH);
  if (originalConfig === null) {
    db.prepare(`DELETE FROM settings WHERE key = 'llm_config'`).run();
  } else {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('llm_config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(originalConfig);
  }
  db.prepare(`DELETE FROM journal_ranks WHERE issn = ?`).run(TEST_ISSN);
  db.prepare(`DELETE FROM debates WHERE motion IN (?, ?)`).run(MOTION, MOTION_DEGRADE);
  db.close();
});

function seedPaper(request: APIRequestContext, title: string, doi: string | null) {
  return request
    .post(`${BASE_URL}/api/workspace/papers`, {
      data: {
        paper: {
          title,
          abstract: `${title} 的摘要，供 e2e 測試 abstract fallback 用。`,
          year: 2026,
          authors: ["Test Author"],
          arxivId: null,
          doi,
          pdfUrl: null,
          citationCount: null,
          source: "openalex",
          venue: null,
          issn: null,
        },
      },
    })
    .then((r) => r.json() as Promise<{ id: string }>);
}

test("篇數上限：4 篇回 400", async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/debate`, {
    data: { motion: "上限測試", paperIds: ["a", "b", "c", "d"], rounds: 1, judges: 1 },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain("1–3");
});

test("外部證據庫全流程：建庫→【X#】chip→openalex_id 快取", async ({ page, request }) => {
  const { id } = await seedPaper(request, "v1.9 外部證據庫測試論文", TEST_DOI);

  try {
    const startRes = await request.post(`${BASE_URL}/api/debate`, {
      data: { motion: MOTION, paperIds: [id], rounds: 1, judges: 1, useExternalEvidence: true },
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

    // API：證據卡落地（mock 相關性過濾選前兩篇：被引最高的 W103 排第一）
    const detail = await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json());
    const cards = detail.debate.externalEvidence as Array<{
      id: string;
      workId: string;
      abstract: string;
      rank: string;
      doi: string | null;
    }>;
    expect(cards).toHaveLength(2);
    expect(cards[0].id).toBe("X1");
    expect(cards[0].workId).toBe("W103");
    expect(cards[0].abstract).toBe("Mock abstract three.");
    expect(cards[0].rank).toBe("Q1");
    expect(cards[1].workId).toBe("W101");

    // openalex_id 已寫回 papers 快取
    const db = new Database(DB_PATH);
    const paperRow = db.prepare(`SELECT openalex_id FROM papers WHERE id = ?`).get(id) as {
      openalex_id: string | null;
    };
    db.close();
    expect(paperRow.openalex_id).toBe("W900");

    // UI：卡片區 + 發言內【X1】chip hover 出卡片內容
    await page.goto(`${BASE_URL}/debate/${debateId}`);
    const main = page.getByRole("main");
    await expect(main.getByTestId("external-evidence-panel")).toBeVisible({ timeout: 15000 });
    await main.getByText("外部證據庫（2 張）").click();
    await expect(main.getByTestId("external-evidence-card")).toHaveCount(2);
    await expect(main.getByTestId("external-evidence-card").first()).toContainText("External Candidate Three");

    const chip = main.getByTestId("external-evidence-chip").first();
    await expect(chip).toBeVisible();
    await chip.hover();
    await expect(main.getByText("外部證據 X1").first()).toBeVisible();
    await expect(main.getByText("「Mock abstract three.」").first()).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.9-external-evidence.png", fullPage: true });

    // 解析快取：同論文再辯一次，resolve 呼叫數不增加
    const callsBefore = resolveCalls;
    const secondRes = await request.post(`${BASE_URL}/api/debate`, {
      data: { motion: MOTION, paperIds: [id], rounds: 1, judges: 1, useExternalEvidence: true },
    });
    const { debateId: secondId } = await secondRes.json();
    await expect
      .poll(
        async () =>
          ((await request.get(`${BASE_URL}/api/debate/${secondId}`).then((r) => r.json())) as {
            debate: { status: string };
          }).debate.status,
        { timeout: 60000 }
      )
      .toBe("done");
    expect(resolveCalls).toBe(callsBefore);
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
  }
});

test("建庫失敗降級：DOI 查無 OpenAlex 資料，辯論照常完成且無證據卡", async ({ request }) => {
  const { id } = await seedPaper(request, "v1.9 降級測試論文", "10.9999/lr-v19-unknown");

  try {
    const startRes = await request.post(`${BASE_URL}/api/debate`, {
      data: { motion: MOTION_DEGRADE, paperIds: [id], rounds: 1, judges: 1, useExternalEvidence: true },
    });
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
    const detail = await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json());
    expect(detail.debate.externalEvidence).toBeNull();
    expect(detail.debate.transcript.length).toBeGreaterThan(0);
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
  }
});

test("無 DOI/arXiv 論文：發起頁證據庫勾選停用並說明", async ({ page, request }) => {
  const { id } = await seedPaper(request, "v1.9 無識別碼論文", null);

  try {
    await page.goto(`${BASE_URL}/debate`);
    const main = page.getByRole("main");
    // 未選論文時勾選框也停用
    await expect(main.getByTestId("external-evidence-toggle")).toBeDisabled();
    await main.getByText("v1.9 無識別碼論文").click();
    await expect(main.getByTestId("external-evidence-toggle")).toBeDisabled();
    await expect(main.getByTestId("external-evidence-reason")).toContainText("無 DOI/arXiv ID");
    // 發起頁第 4 篇勾不了的上限邏輯（UI 端）由 disabled 屬性保證，這裡驗證計數文案
    await expect(main.getByText("已選 1 / 3 篇")).toBeVisible();
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
  }
});
