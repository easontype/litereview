import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3001";

test("搜尋頁：導覽列 + arXiv ID 搜尋 + 加入工作區 + 導覽切換", async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(msg.text()));
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(BASE_URL);

  await expect(page.getByText("litereview", { exact: true })).toBeVisible();
  const searchLink = page.getByRole("link", { name: "搜尋" });
  const workspaceLink = page.getByRole("link", { name: "工作區" });
  const compareLink = page.getByRole("link", { name: "比較" });
  await expect(searchLink).toBeVisible();
  await expect(workspaceLink).toBeVisible();
  await expect(compareLink).toBeVisible();

  const searchInput = page.getByPlaceholder(/transformer attention/);
  await searchInput.fill("1706.03762");
  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.getByText("Attention Is All You Need")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("1 筆結果")).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/search-results.png", fullPage: true });

  await page.getByRole("button", { name: "加入工作區" }).click();
  expect(pageErrors).toEqual([]);
  expect(consoleLogs.some((l) => l.includes("加入工作區"))).toBeTruthy();

  await workspaceLink.click();
  await expect(page).toHaveURL(`${BASE_URL}/workspace`);
  await expect(page.getByRole("heading", { name: "工作區" })).toBeVisible();

  await compareLink.click();
  await expect(page).toHaveURL(`${BASE_URL}/compare`);
  await expect(page.getByRole("heading", { name: "比較" })).toBeVisible();
});
