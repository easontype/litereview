import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3006";

test("工作區已分析論文顯示重點結果頁", async ({ page }) => {
  await page.goto(`${BASE_URL}/workspace`);
  const row = page.locator("li", { hasText: "Attention Is All You Need" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "查看重點" }).click();
  await expect(page).toHaveURL(/\/workspace\/[a-f0-9]+$/);

  await expect(page.getByText("研究問題")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("新穎度", { exact: true })).toBeVisible();
  await expect(page.getByText("arXiv 全文")).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/keypoints-arxiv.png", fullPage: true });
});

test("abstract_only 論文顯示明顯警示樣式", async ({ page }) => {
  await page.goto(`${BASE_URL}/workspace`);
  const row = page.locator("li", { hasText: "純假設測試論文" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "查看重點" }).click();
  await expect(page).toHaveURL(/\/workspace\/[a-f0-9]+$/);

  await expect(page.getByText("僅摘要分析：找不到論文全文")).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: "test-results/screenshots/keypoints-abstract-only.png", fullPage: true });
});
