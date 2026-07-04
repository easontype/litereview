import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

test("搜尋頁：側邊欄 + arXiv ID 搜尋 + 加入工作區 + 導覽切換", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(`${BASE_URL}/search`);

  await expect(page.getByText("litereview", { exact: true })).toBeVisible();
  const searchLink = page.getByRole("link", { name: "搜尋文獻" });
  const workspaceLink = page.getByRole("link", { name: /^工作區/ });
  const compareLink = page.getByRole("link", { name: /^比較/ });
  await expect(searchLink).toBeVisible();
  await expect(workspaceLink).toBeVisible();
  await expect(compareLink).toBeVisible();

  const searchInput = page.getByPlaceholder(/transformer attention/);
  await searchInput.fill("1706.03762");
  await page.getByRole("button", { name: "搜尋" }).click();

  const main = page.locator("main");
  await expect(main.getByText("Attention Is All You Need")).toBeVisible({ timeout: 15000 });
  await expect(main.getByText("1 筆結果")).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/search-results.png", fullPage: true });

  await page.getByRole("button", { name: "加入工作區" }).click();
  await expect(page.getByRole("button", { name: "已加入" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await workspaceLink.click();
  await expect(page).toHaveURL(`${BASE_URL}/workspace`);
  await expect(page.getByRole("heading", { name: "工作區", exact: true })).toBeVisible();

  await compareLink.click();
  await expect(page).toHaveURL(`${BASE_URL}/compare`);
  await expect(page.getByRole("heading", { name: "比較", exact: true })).toBeVisible();
});
