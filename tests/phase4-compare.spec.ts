import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3001";

test("勾選兩篇已分析論文送出比較，表格與 verdict 正確呈現", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto(`${BASE_URL}/compare`);

  const row1 = page.locator("li", { hasText: "Attention Is All You Need" });
  const row2 = page.locator("li", { hasText: "BERT" });
  await expect(row1).toBeVisible();
  await expect(row2).toBeVisible();

  await row1.locator('input[type="checkbox"]').check();
  await row2.locator('input[type="checkbox"]').check();

  await page.getByRole("button", { name: "比較" }).click();
  await expect(page.getByText("比較中…")).toBeVisible();

  await expect(page.getByText("研究方法", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("綜合結論")).toBeVisible();

  const table = page.locator("table");
  await expect(table.getByRole("columnheader", { name: "Attention Is All You Need" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /BERT/ })).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/compare-result.png", fullPage: true });
});

test("勾選不足 2 篇時比較按鈕為 disabled", async ({ page }) => {
  await page.goto(`${BASE_URL}/compare`);
  const button = page.getByRole("button", { name: "比較" });
  await expect(button).toBeDisabled();
});
