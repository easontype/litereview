import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

// 最小合法 PDF（單空白頁），免除對本機測試檔案的依賴
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>
%%EOF`,
  "utf-8"
);

test("上傳 PDF 加入工作區，清單顯示已上傳項目；找重點顯示清楚的失敗訊息（無 MARKER_API_KEY）", async ({ page }) => {
  test.setTimeout(60000);
  const title = `Playwright 上傳測試論文 ${Date.now()}`;

  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");

  await expect(main.getByText("上傳 PDF 加入工作區")).toBeVisible();

  await main.locator('input[type="file"]').setInputFiles({
    name: "tmp-test-paper.pdf",
    mimeType: "application/pdf",
    buffer: MINIMAL_PDF,
  });
  await page.getByPlaceholder("標題（選填，預設用檔名）").fill(title);
  await page.getByRole("button", { name: "上傳" }).click();

  const row = main.locator("li", { hasText: title });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByText("已上傳 PDF")).toBeVisible();
  await expect(row.getByText("未分析")).toBeVisible();

  await row.getByRole("link", { name: "找重點" }).click();
  await expect(page.getByText(/找不到可分析的內容/)).toBeVisible({ timeout: 30000 });
});
