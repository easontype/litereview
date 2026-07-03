import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

test("工作區論文找重點 → 顯示結構化重點結果頁", async ({ page }) => {
  // 全文擷取 + claude -p 分析可能需要數分鐘（已有快取則秒回）
  test.setTimeout(360000);
  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");
  const row = main.locator("li", { hasText: "Attention Is All You Need" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: /重點/ }).click();
  await expect(page).toHaveURL(/\/workspace\/[a-f0-9]+$/);

  await expect(page.getByText("研究問題")).toBeVisible({ timeout: 300000 });
  await expect(page.getByText("新穎度", { exact: true })).toBeVisible();
  await expect(page.getByText("arXiv 全文")).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/keypoints-arxiv.png", fullPage: true });
});

test("abstract_only 論文顯示明顯警示樣式", async ({ page }) => {
  test.setTimeout(360000);
  // 播種：無 arXiv ID / DOI 的假論文，只有摘要 → 走 abstract_only fallback
  await page.request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "純假設測試論文：不存在的全文",
        abstract: "本論文提出一個假設性的框架，用於驗證 litereview 在找不到全文時的降級行為。",
        authors: ["測試作者"],
        year: 2026,
        arxivId: null,
        doi: null,
        pdfUrl: null,
        source: "openalex",
        venue: null,
        citationCount: null,
        quality: null,
      },
    },
  });

  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");
  const row = main.locator("li", { hasText: "純假設測試論文" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: /重點/ }).click();
  await expect(page).toHaveURL(/\/workspace\/[a-f0-9]+$/);

  await expect(page.getByText("僅摘要分析：找不到論文全文")).toBeVisible({ timeout: 300000 });

  await page.screenshot({ path: "test-results/screenshots/keypoints-abstract-only.png", fullPage: true });
});
