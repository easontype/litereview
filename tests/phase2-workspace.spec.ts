import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3005";

test("搜尋頁加入工作區 → 工作區頁顯示 → 移除", async ({ page }) => {
  await page.goto(BASE_URL);

  const searchInput = page.getByPlaceholder(/transformer attention/);
  await searchInput.fill("1706.03762");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page.getByText("Attention Is All You Need")).toBeVisible({ timeout: 15000 });

  const addButton = page.getByRole("button", { name: "加入工作區" });
  await addButton.click();
  await expect(page.getByRole("button", { name: "已加入" })).toBeVisible();

  await page.getByRole("link", { name: "工作區" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/workspace`);
  await expect(page.getByText("Attention Is All You Need")).toBeVisible();
  await expect(page.getByText("未分析")).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/workspace.png", fullPage: true });

  await page.getByRole("button", { name: "移除" }).click();
  await expect(page.getByText("尚未加入任何論文")).toBeVisible();
});
