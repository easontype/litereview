import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

test("搜尋頁加入工作區 → 工作區頁顯示 → 移除 → 重新加入（還原狀態）", async ({ page }) => {
  await page.goto(BASE_URL);

  const searchInput = page.getByPlaceholder(/transformer attention/);
  await searchInput.fill("1706.03762");
  await page.getByRole("button", { name: "搜尋" }).click();
  const main = page.locator("main");
  await expect(main.getByText("Attention Is All You Need")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "加入工作區" }).click();
  await expect(page.getByRole("button", { name: "已加入" })).toBeVisible();

  await page.getByRole("link", { name: /^工作區/ }).click();
  await expect(page).toHaveURL(`${BASE_URL}/workspace`);
  const row = main.locator("li", { hasText: "Attention Is All You Need" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/已分析|未分析|僅摘要/)).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/workspace.png", fullPage: true });

  await row.getByRole("button", { name: "移除" }).click();
  await expect(main.getByText("Attention Is All You Need")).toBeHidden();

  // 還原狀態：phase3 / phase4 依賴 Attention 在工作區
  await page.getByRole("link", { name: "搜尋文獻" }).click();
  await page.getByPlaceholder(/transformer attention/).fill("1706.03762");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(main.getByText("Attention Is All You Need")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "加入工作區" }).click();
  await expect(page.getByRole("button", { name: "已加入" })).toBeVisible();

  await page.getByRole("link", { name: /^工作區/ }).click();
  await expect(main.locator("li", { hasText: "Attention Is All You Need" })).toBeVisible();
});
