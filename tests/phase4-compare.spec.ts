import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

test("勾選兩篇論文送出比較，表格與 verdict 正確呈現，並轉為可回訪的歷史網址", async ({ page }) => {
  // 未分析論文會先自動跑找重點，再跑比較，全程可能需要數分鐘
  test.setTimeout(600000);

  // 播種：確保 BERT 在工作區（比較時會自動觸發其 F3 分析）
  await page.request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        abstract: null,
        authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"],
        year: 2019,
        arxivId: "1810.04805",
        doi: null,
        pdfUrl: null,
        source: "arxiv",
        venue: "NAACL",
        citationCount: null,
        quality: null,
      },
    },
  });

  await page.goto(`${BASE_URL}/compare`);
  const main = page.locator("main");

  const row1 = main.locator("li", { hasText: "Attention Is All You Need" });
  await expect(row1).toBeVisible();
  await row1.locator('input[type="checkbox"]').check();

  // BERT 若尚未分析不會出現在比較選單，改走工作區勾選流程前先確認；
  // 此處直接對已分析清單操作：若 BERT 不在清單，透過 API 觸發分析後重整。
  const row2 = main.locator("li", { hasText: "BERT" });
  if (!(await row2.isVisible().catch(() => false))) {
    await page.request.post(`${BASE_URL}/api/keypoints/${await paperIdOf(page, "BERT")}`, {
      data: {},
      timeout: 300000,
    });
    await page.reload();
    await row1.locator('input[type="checkbox"]').check();
  }
  await expect(row2).toBeVisible();
  await row2.locator('input[type="checkbox"]').check();

  await page.getByRole("button", { name: "比較", exact: true }).click();
  await expect(page.getByText("比較中…")).toBeVisible();

  await expect(page.getByText("研究方法", { exact: true })).toBeVisible({ timeout: 300000 });
  await expect(page.getByText("綜合結論")).toBeVisible();

  // 成功後應轉為 /compare?id=... 的可回訪網址
  await expect(page).toHaveURL(/\/compare\?id=[a-f0-9]+/);

  const table = page.locator("table");
  await expect(table.getByRole("columnheader", { name: "Attention Is All You Need" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /BERT/ })).toBeVisible();

  await page.screenshot({ path: "test-results/screenshots/compare-result.png", fullPage: true });
});

test("勾選不足 2 篇時比較按鈕為 disabled", async ({ page }) => {
  await page.goto(`${BASE_URL}/compare`);
  const button = page.getByRole("button", { name: "比較", exact: true });
  await expect(button).toBeDisabled();
});

/** 從工作區 API 找出標題含關鍵字的論文 id。 */
async function paperIdOf(page: import("@playwright/test").Page, keyword: string): Promise<string> {
  const res = await page.request.get(`${BASE_URL}/api/workspace/papers`);
  const json = (await res.json()) as { items: Array<{ id: string; title: string }> };
  const item = json.items.find((it) => it.title.includes(keyword));
  if (!item) throw new Error(`工作區找不到含「${keyword}」的論文`);
  return item.id;
}
