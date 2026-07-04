import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

// v1.5 移除搜尋頁後改用 API 播種；phase3 / phase4 依賴 Attention 以此標題留在工作區。
const ATTENTION = {
  title: "Attention Is All You Need",
  abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
  year: 2017,
  authors: ["Ashish Vaswani", "Noam Shazeer"],
  arxivId: "1706.03762",
  doi: null,
  pdfUrl: null,
  citationCount: 140000,
  source: "arxiv",
  venue: null,
};

test("API 播種加入工作區 → 工作區頁顯示 → 移除 → 重新加入（還原狀態）", async ({ page, request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, { data: { paper: ATTENTION } });
  expect(created.ok()).toBeTruthy();

  await page.goto(`${BASE_URL}/workspace`);
  const main = page.locator("main");
  const row = main.locator("li", { hasText: "Attention Is All You Need" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/已分析|未分析|僅摘要/)).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/workspace.png", fullPage: true });

  await row.getByRole("button", { name: "移除" }).click();
  await expect(main.getByText("Attention Is All You Need")).toBeHidden();

  // 還原狀態：phase3 / phase4 依賴 Attention 在工作區
  const restored = await request.post(`${BASE_URL}/api/workspace/papers`, { data: { paper: ATTENTION } });
  expect(restored.ok()).toBeTruthy();

  await page.reload();
  await expect(main.locator("li", { hasText: "Attention Is All You Need" })).toBeVisible();
});
