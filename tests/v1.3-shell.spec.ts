import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";

/** v1.3 shell：商品頁、CTA 跳轉、⌘K、儀表板、關係圖譜（全部播種資料，不呼叫真 LLM）。 */

test("商品頁：/ 呈現硃批 landing，CTA 進入工作台跳 /dashboard", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(BASE_URL);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("硃批");
  await expect(page.getByText("LOCAL-FIRST · OPEN SOURCE")).toBeVisible();
  // 商品頁沒有 app 側邊欄
  await expect(page.getByRole("link", { name: "期刊分級" })).toHaveCount(0);

  await page.screenshot({ path: "test-results/screenshots/v1.3-landing.png" });

  await page.getByRole("navigation").getByRole("link", { name: "進入工作台" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
  await expect(page.getByRole("heading", { name: "儀表板" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("⌘K 指令面板：Ctrl+K 開啟、輸入後 Enter 跳頁", async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("搜尋論文、跳頁、查期刊分級…");
  await expect(input).toBeVisible();

  await input.fill("圖譜");
  await expect(page.getByLabel("前往").getByText("關係圖譜", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${BASE_URL}/graph`);

  // Esc 關閉
  await page.keyboard.press("Control+k");
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("儀表板統計 + 關係圖譜節點（播種兩篇共同作者論文）", async ({ page, request }) => {
  const seeded: string[] = [];
  for (const title of ["圖譜測試論文甲", "圖譜測試論文乙"]) {
    const res = await request.post(`${BASE_URL}/api/workspace/papers`, {
      data: {
        paper: {
          title,
          abstract: "",
          year: 2026,
          authors: ["Litereview Tester", `${title} 專屬作者`],
          arxivId: null,
          doi: null,
          pdfUrl: null,
          citationCount: 123,
          source: "openalex",
          venue: null,
        },
      },
    });
    const { id } = await res.json();
    seeded.push(id);
  }

  try {
    // 統計 API 反映播種
    const stats = await request.get(`${BASE_URL}/api/dashboard/stats`).then((r) => r.json());
    expect(stats.counts.papers).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(stats.recent)).toBe(true);

    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByText("工作區論文")).toBeVisible();
    await expect(page.getByText("最近活動")).toBeVisible();
    await expect(page.getByText("圖譜測試論文甲").first()).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/v1.3-dashboard.png", fullPage: true });

    // 圖譜 API：兩節點 + 共同作者邊
    const graph = await request.get(`${BASE_URL}/api/graph`).then((r) => r.json());
    const ids = new Set(graph.nodes.map((n: { id: string }) => n.id));
    expect(ids.has(seeded[0]) && ids.has(seeded[1])).toBe(true);
    const coEdge = graph.edges.find(
      (e: { source: string; target: string; type: string }) =>
        e.type === "coauthor" &&
        [e.source, e.target].sort().join() === [...seeded].sort().join()
    );
    expect(coEdge).toBeTruthy();

    // 圖譜頁：SVG 節點渲染 + hover 資訊卡
    await page.goto(`${BASE_URL}/graph`);
    await expect(page.getByRole("heading", { name: "關係圖譜" })).toBeVisible();
    const circles = page.locator("main svg circle");
    expect(await circles.count()).toBeGreaterThanOrEqual(2);
    await page.getByText("圖譜測試論文甲").first().hover();
    await page.screenshot({ path: "test-results/screenshots/v1.3-graph.png", fullPage: true });
  } finally {
    for (const id of seeded) {
      await request.delete(`${BASE_URL}/api/workspace/papers/${id}`);
    }
  }
});
