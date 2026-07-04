import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { buildSamplePdf } from "../src/lib/fulltext/sample-pdf";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge"];

// 有文字內容的 PDF：v1.4 起內建 pdfjs 轉換能直接抽出全文
const TEXT_PDF = buildSamplePdf([
  "A Study on Local PDF Extraction for Literature Review Tools.",
  "Abstract: We investigate whether a built-in PDF text extractor",
  "can replace a cloud parsing API for personal research tools.",
  "Our experiments show that column-aware linearization produces",
  "readable linear text suitable for LLM-based key point analysis.",
]);

// 無文字層的空白頁 PDF：模擬掃描影像檔，內建轉換抽不出字
const EMPTY_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>
%%EOF`,
  "utf-8"
);

let originalLlmConfig: string | null = null;
let originalPdfCommand: string | null = null;

// 座位全指 mock（零額度）；清掉外部 PDF 轉換命令，確保測的是內建 pdfjs 路徑
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

async function uploadPdf(page: import("@playwright/test").Page, title: string, buffer: Buffer) {
  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");
  await expect(main.getByText("上傳 PDF 加入工作區")).toBeVisible();
  await main.locator('input[type="file"]').setInputFiles({
    name: "tmp-test-paper.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await page.getByPlaceholder("標題（選填，預設用檔名）").fill(title);
  await page.getByRole("button", { name: "上傳" }).click();
  const row = main.locator("li", { hasText: title });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByText("已上傳 PDF")).toBeVisible();
  return row;
}

test("上傳含文字 PDF → 找重點成功（內建 pdfjs 轉換，零金鑰）", async ({ page }) => {
  test.setTimeout(60000);
  const row = await uploadPdf(page, `Playwright 上傳成功測試 ${Date.now()}`, TEXT_PDF);
  await row.getByRole("link", { name: "找重點" }).click();
  await expect(page.getByText("【mock】研究問題")).toBeVisible({ timeout: 30000 });
});

test("上傳無文字層 PDF（掃描影像）→ 顯示清楚的失敗訊息", async ({ page }) => {
  test.setTimeout(60000);
  const row = await uploadPdf(page, `Playwright 上傳失敗測試 ${Date.now()}`, EMPTY_PDF);
  await expect(row.getByText("未分析")).toBeVisible();
  await row.getByRole("link", { name: "找重點" }).click();
  await expect(page.getByText(/找不到可分析的內容/)).toBeVisible({ timeout: 30000 });
});
