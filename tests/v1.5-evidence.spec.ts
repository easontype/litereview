import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { buildSamplePdf } from "../src/lib/fulltext/sample-pdf";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge"];

const TEXT_PDF = buildSamplePdf([
  "Evidence popover end-to-end test paper.",
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

test("出處引文：上傳→找重點→hover popover→開啟 PDF 跳頁→/pdfs 工具頁", async ({ page, request }) => {
  test.setTimeout(90000);
  const title = `v1.5 出處測試 ${Date.now()}`;

  // 上傳 PDF
  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");
  await main.locator('input[type="file"]').setInputFiles({
    name: "evidence-test.pdf",
    mimeType: "application/pdf",
    buffer: TEXT_PDF,
  });
  await page.getByPlaceholder("標題（選填，預設用檔名）").fill(title);
  await page.getByRole("button", { name: "上傳" }).click();
  const row = main.locator("li", { hasText: title });
  await expect(row).toBeVisible({ timeout: 15000 });

  const list = await request.get(`${BASE_URL}/api/workspace/papers`).then((r) => r.json());
  const item = (list.items as Array<{ id: string; title: string; hasPdf: boolean }>).find(
    (it) => it.title === title
  );
  expect(item).toBeTruthy();
  expect(item!.hasPdf).toBe(true);
  const id = item!.id;

  try {
    // 找重點（mock）
    await row.getByRole("link", { name: "找重點" }).click();
    await expect(page.getByText("【mock】研究問題")).toBeVisible({ timeout: 30000 });

    // API 回應帶 evidence（守住 KeypointsRow 傳遞）
    const kp = await request.get(`${BASE_URL}/api/keypoints/${id}`).then((r) => r.json());
    expect(kp.keypoints.evidence.research_question[0].quote).toContain("【mock】出處引文");

    // hover 研究問題 → popover 顯示引文與頁碼
    await page.getByText("【mock】研究問題").hover();
    await expect(page.getByText(/【mock】出處引文：本研究旨在解決/)).toBeVisible();
    await expect(page.getByText("第 1 頁")).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.5-evidence-popover.png" });

    // 點「開啟 PDF」→ 側邊面板 iframe 出現且跳到第 1 頁
    await page.getByRole("button", { name: "開啟 PDF" }).first().click();
    const iframe = page.locator('iframe[title="PDF 閱覽"]');
    await expect(iframe).toBeVisible();
    expect(await iframe.getAttribute("src")).toContain(`/api/pdf/${id}#page=1`);
    await page.screenshot({ path: "test-results/screenshots/v1.5-pdf-panel.png" });

    // PDF route：200 + application/pdf；未知 id 404
    const pdfRes = await request.get(`${BASE_URL}/api/pdf/${id}`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
    expect((await request.get(`${BASE_URL}/api/pdf/0000000000000000`)).status()).toBe(404);

    // 審查（mock）→ 分數理由 hover 出 popover
    const review = await request.post(`${BASE_URL}/api/review/${id}`, { data: {} }).then((r) => r.json());
    expect(review.status).toBe("done");
    expect(review.review.data.evidence.scores.methodological_rigor[0].quote).toContain("【mock】審查出處引文");
    await page.reload();
    await main.getByRole("button", { name: "審查" }).click();
    await expect(main.getByText("方法嚴謹度")).toBeVisible({ timeout: 15000 });
    await main.getByText(/【mock】方法描述完整/).hover();
    await expect(page.getByText(/【mock】審查出處引文/)).toBeVisible();

    // /pdfs 工具頁：列出並可開啟
    await page.goto(`${BASE_URL}/pdfs`);
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.locator('iframe[title="PDF 閱覽"]')).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.5-pdfs-page.png" });
  } finally {
    await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
  }
});
