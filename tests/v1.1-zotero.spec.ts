import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

const FAKE_ITEM = {
  zoteroKey: "LRTESTKEY",
  title: "litereview Zotero 匯入測試論文",
  authors: ["測試作者"],
  year: 2026,
  doi: null,
  arxivId: null,
  abstract: "這是 Zotero 匯入流程的測試摘要。",
  venue: null,
  issn: null,
  itemType: "journalArticle",
};

test("Zotero 匯入 API：假條目 → 工作區顯示 Zotero 來源 → 清理", async ({ page, request }) => {
  const res = await request.post(`${BASE_URL}/api/zotero/import`, { data: { items: [FAKE_ITEM] } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.imported).toBe(1);
  const paperId = json.ids[0] as string;

  // 工作區 API 帶出 zoteroKey
  const list = await request.get(`${BASE_URL}/api/workspace/papers`).then((r) => r.json());
  const item = list.items.find((it: { id: string }) => it.id === paperId);
  expect(item).toBeTruthy();
  expect(item.zoteroKey).toBe("LRTESTKEY");
  expect(item.source).toBe("zotero");

  // 工作區頁 UI 顯示來源標籤
  await page.goto(`${BASE_URL}/workspace`);
  const row = page.locator("main li", { hasText: FAKE_ITEM.title });
  await expect(row).toBeVisible();
  await expect(row.getByText("Zotero", { exact: true })).toBeVisible();

  // 未分析就回寫 → 明確 400
  const writeback = await request.post(`${BASE_URL}/api/zotero/writeback/${paperId}`);
  expect(writeback.status()).toBe(400);
  expect((await writeback.json()).error).toContain("尚未分析");

  // 清理
  await request.delete(`${BASE_URL}/api/workspace/papers/${paperId}`);
});

test("非 Zotero 論文回寫 → 明確 400", async ({ request }) => {
  const created = await request.post(`${BASE_URL}/api/workspace/papers`, {
    data: {
      paper: {
        title: "litereview 非 Zotero 測試論文",
        abstract: "",
        year: 2026,
        authors: [],
        arxivId: null,
        doi: null,
        pdfUrl: null,
        citationCount: null,
        source: "openalex",
      },
    },
  });
  const { id } = await created.json();

  const writeback = await request.post(`${BASE_URL}/api/zotero/writeback/${id}`);
  expect(writeback.status()).toBe(400);
  expect((await writeback.json()).error).toContain("不是從 Zotero 匯入");

  await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
});

test("匯入彈層：開啟後顯示 collection 清單或離線引導", async ({ page }) => {
  await page.goto(`${BASE_URL}/workspace`);
  await page.getByRole("main").getByRole("button", { name: "從 Zotero 匯入" }).click();

  const dialog = page.getByRole("dialog", { name: "從 Zotero 匯入" });
  await expect(dialog).toBeVisible();
  // 依本機 Zotero 是否開啟走不同分支，兩者擇一出現即通過
  await expect(
    dialog.getByText("全部條目").or(dialog.getByText("找不到本機的 Zotero"))
  ).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: "test-results/screenshots/zotero-import.png", fullPage: true });
});
