import { test, expect, type APIRequestContext } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { buildSamplePdf } from "../src/lib/fulltext/sample-pdf";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge"];

const TEXT_PDF = buildSamplePdf([
  "Evidence flows end-to-end test paper.",
  "This paragraph is the source of all mock quotes.",
  "It exists so the built-in extractor returns real text.",
]);

let originalLlmConfig: string | null = null;
let originalPdfCommand: string | null = null;

// 座位全指 mock（零額度）；清掉外部 PDF 轉換命令，確保走內建 pdfjs（有頁碼標記）
test.beforeAll(() => {
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const read = (key: string) =>
    (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined)
      ?.value ?? null;

  originalLlmConfig = read("llm_config");
  upsert.run(
    "llm_config",
    JSON.stringify({
      providers: [{ id: "mock-e2e", kind: "mock", label: "Mock E2E", models: ["mock-1"] }],
      seats: Object.fromEntries(SEATS.map((s) => [s, { providerId: "mock-e2e", model: "mock-1" }])),
    })
  );
  originalPdfCommand = read("pdf2md_command");
  db.prepare(`DELETE FROM settings WHERE key = 'pdf2md_command'`).run();
  db.close();
});

test.afterAll(() => {
  const db = new Database(DB_PATH);
  const restore = (key: string, value: string | null) => {
    if (value === null) {
      db.prepare(`DELETE FROM settings WHERE key = ?`).run(key);
    } else {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(key, value);
    }
  };
  restore("llm_config", originalLlmConfig);
  restore("pdf2md_command", originalPdfCommand);
  db.close();
});

async function uploadPdf(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.post(`${BASE_URL}/api/workspace/upload`, {
    multipart: {
      file: { name: "evidence-flow.pdf", mimeType: "application/pdf", buffer: TEXT_PDF },
      title,
    },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

test("比較 evidence：引文編號映射→hover popover→開啟 PDF 深連結", async ({ page, request }) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  const idA = await uploadPdf(request, `v1.6 比較出處 A ${stamp}`);
  const idB = await uploadPdf(request, `v1.6 比較出處 B ${stamp}`);

  try {
    // 同步 compare API（內部先自動跑 mock 找重點）→ evidence 編號命中 keypoints 引文
    const res = await request.post(`${BASE_URL}/api/compare`, { data: { paperIds: [idA, idB] } });
    expect(res.ok()).toBeTruthy();
    const compare = (await res.json()) as {
      id: string;
      evidence: { methodology: Array<Array<{ quote: string; page: number | null }>> };
    };
    expect(compare.evidence.methodology[0][0].quote).toContain("【mock】出處引文");
    expect(compare.evidence.methodology[0][0].page).toBe(1);

    // 結果頁：hover 格子 → popover 顯示引文與頁碼（浮層與觸發格同一個 <td>，用 td 範圍斷言）
    await page.goto(`${BASE_URL}/compare?id=${compare.id}`);
    const cellText = "【mock】論文 1 的方法摘要";
    await expect(page.getByText(cellText)).toBeVisible();
    await page.getByText(cellText).hover();
    const td = page.locator("td", { hasText: cellText });
    await expect(td.getByText(/【mock】出處引文：本研究旨在解決/)).toBeVisible();
    await expect(td.getByText("第 1 頁")).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.6-compare-evidence-popover.png" });

    // 點「開啟 PDF」→ 進論文頁 ?pdf=1 深連結，PDF 面板 iframe 跳到第 1 頁
    await td.getByRole("button", { name: "開啟 PDF" }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${idA}\\?pdf=1`));
    const iframe = page.locator('iframe[title="PDF 閱覽"]');
    await expect(iframe).toBeVisible({ timeout: 15000 });
    expect(await iframe.getAttribute("src")).toContain(`/api/pdf/${idA}#page=1`);
    await page.screenshot({ path: "test-results/screenshots/v1.6-compare-pdf-deeplink.png" });
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${idA}`);
    await request.delete(`${BASE_URL}/api/workspace/papers/${idB}`);
  }
});

test("辯論 evidence：引文庫存庫→【E#】chip 渲染→hover 引文", async ({ page, request }) => {
  test.setTimeout(120000);
  const paperId = await uploadPdf(request, `v1.6 辯論出處 ${Date.now()}`);

  try {
    const res = await request.post(`${BASE_URL}/api/debate`, {
      data: { motion: "v1.6 出處引文測試辯題", paperIds: [paperId], rounds: 1 },
    });
    expect(res.ok()).toBeTruthy();
    const { debateId } = (await res.json()) as { debateId: string };

    // mock 辯論很快；輪詢到 done
    await expect
      .poll(
        async () =>
          ((await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json())) as {
            debate: { status: string };
          }).debate.status,
        { timeout: 60000 }
      )
      .toBe("done");

    // API 帶回引文庫（守住 DebateRow 傳遞）
    const detail = (await request.get(`${BASE_URL}/api/debate/${debateId}`).then((r) => r.json())) as {
      debate: { evidence: Array<{ id: string; paperId: string; quote: string; page: number | null }> | null };
    };
    expect(detail.debate.evidence).toBeTruthy();
    expect(detail.debate.evidence![0].id).toBe("E1");
    expect(detail.debate.evidence![0].paperId).toBe(paperId);
    expect(detail.debate.evidence![0].quote).toContain("【mock】出處引文");

    // 逐字稿頁：【E1】chip 出現，hover 顯示引文 popover
    await page.goto(`${BASE_URL}/debate/${debateId}`);
    const chip = page.getByTestId("evidence-chip").first();
    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.hover();
    await expect(
      page.getByText(/【mock】出處引文：本研究旨在解決/).filter({ visible: true })
    ).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.6-debate-evidence-chip.png" });
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${paperId}`);
  }
});

test("舊比較紀錄降級：無 evidence 正常渲染、無出處底線", async ({ page }) => {
  const legacyId = `legacy${Date.now().toString(36)}`;
  const db = new Database(DB_PATH);
  db.prepare(
    `INSERT INTO comparisons (id, paper_ids, result_json, created_at) VALUES (?, ?, ?, ?)`
  ).run(
    legacyId,
    JSON.stringify(["legacy-paper-1", "legacy-paper-2"]),
    JSON.stringify({
      methodology: ["舊紀錄方法摘要甲", "舊紀錄方法摘要乙"],
      data_experiments: ["舊紀錄資料甲", "舊紀錄資料乙"],
      contributions: ["舊紀錄貢獻甲", "舊紀錄貢獻乙"],
      limitations: ["舊紀錄侷限甲", "舊紀錄侷限乙"],
      novelty: ["舊紀錄新穎度甲", "舊紀錄新穎度乙"],
      verdict: "舊紀錄綜合結論",
    }),
    new Date().toISOString()
  );
  db.close();

  try {
    await page.goto(`${BASE_URL}/compare?id=${legacyId}`);
    await expect(page.getByText("舊紀錄方法摘要甲")).toBeVisible();
    await expect(page.getByText("舊紀錄綜合結論")).toBeVisible();
    // 沒有 evidence → 表格內不該有任何出處底線觸發元素
    expect(await page.locator("td .cursor-help").count()).toBe(0);
  } finally {
    const cleanup = new Database(DB_PATH);
    cleanup.prepare(`DELETE FROM comparisons WHERE id = ?`).run(legacyId);
    cleanup.close();
  }
});
