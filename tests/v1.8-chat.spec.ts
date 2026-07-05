import { test, expect, type APIRequestContext } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const SEATS = ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge", "judge2", "judge3"];
const PAPER_ID = `v18chat${Date.now().toString(36)}`;
const PAPER_TITLE = "v1.8 Chat 測試論文";
const DEBATE_MOTION = "v1.8 e2e 測試辯題：chat 發起辯論";

// 1x1 透明 PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let originalConfig: string | null = null;
const chatIds: string[] = [];

// 全座位指到 mock provider（/review、/debate 命令會走 seats）；chat 本身用 mock-e2e provider
test.beforeAll(() => {
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'llm_config'`).get() as
    | { value: string }
    | undefined;
  originalConfig = row?.value ?? null;
  const config = {
    providers: [{ id: "mock-e2e", kind: "mock", label: "Mock E2E", models: ["mock-1"] }],
    seats: Object.fromEntries(SEATS.map((s) => [s, { providerId: "mock-e2e", model: "mock-1" }])),
  };
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('llm_config', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(config));

  // 播種論文 + 超過 60k 的全文快取（驗證截斷標示；也讓 /review 不打網路）
  db.prepare(
    `INSERT INTO papers (id, title, abstract, authors, year, source, created_at)
     VALUES (?, ?, ?, '[]', 2026, 'openalex', ?)`
  ).run(PAPER_ID, PAPER_TITLE, "v1.8 chat e2e 測試摘要。", new Date().toISOString());
  db.prepare(`INSERT INTO workspace_items (paper_id, added_at) VALUES (?, ?)`).run(
    PAPER_ID,
    new Date().toISOString()
  );
  const longText = `【第 1 頁】${"實驗結果顯示方法有效。".repeat(6500)}`;
  db.prepare(
    `INSERT INTO fulltexts (paper_id, source, text, page_count, created_at) VALUES (?, 'upload', ?, 1, ?)`
  ).run(PAPER_ID, longText, new Date().toISOString());
  db.close();
});

test.afterAll(() => {
  const db = new Database(DB_PATH);
  if (originalConfig === null) {
    db.prepare(`DELETE FROM settings WHERE key = 'llm_config'`).run();
  } else {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('llm_config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(originalConfig);
  }
  for (const chatId of chatIds) {
    db.prepare(`DELETE FROM chat_messages WHERE chat_id = ?`).run(chatId);
    db.prepare(`DELETE FROM chats WHERE id = ?`).run(chatId);
  }
  db.prepare(`DELETE FROM debates WHERE motion = ?`).run(DEBATE_MOTION);
  for (const table of ["fulltexts", "keypoints", "reviews", "workspace_items", "papers"]) {
    db.prepare(`DELETE FROM ${table} WHERE ${table === "papers" ? "id" : "paper_id"} = ?`).run(PAPER_ID);
  }
  db.close();
});

async function createMockChat(request: APIRequestContext, paperIds: string[] = []): Promise<string> {
  const res = await request.post(`${BASE_URL}/api/chat`, {
    data: { providerId: "mock-e2e", model: "mock-1", paperIds },
  });
  expect(res.ok()).toBe(true);
  const { id } = await res.json();
  chatIds.push(id);
  return id;
}

test("送訊息 → 串流回覆落地，重整後訊息還在", async ({ page, request }) => {
  const chatId = await createMockChat(request);
  await page.goto(`${BASE_URL}/chat/${chatId}`);

  await page.getByPlaceholder(/輸入訊息/).fill("你好，這是 e2e 測試訊息");
  await page.getByTitle("送出").click();

  // 訊息文字會同時變成對話標題（h1），斷言範圍縮到訊息氣泡的 span
  const main = page.getByRole("main");
  const userBubble = main.locator("span.whitespace-pre-wrap", { hasText: "你好，這是 e2e 測試訊息" });
  await expect(userBubble).toBeVisible({ timeout: 10000 });
  await expect(main.getByText(/【mock】這是模擬的對話回覆/)).toBeVisible({ timeout: 20000 });

  // 重整：訊息從 DB 載回（不是只存在串流狀態）
  await page.reload();
  await expect(userBubble).toBeVisible({ timeout: 10000 });
  await expect(main.getByText(/【mock】這是模擬的對話回覆/)).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/v1.8-chat-stream.png", fullPage: true });
});

test("勾選論文 → 注入 chip 顯示篇數/字數與截斷標示", async ({ page, request }) => {
  const chatId = await createMockChat(request);
  await page.goto(`${BASE_URL}/chat/${chatId}`);

  await page.getByRole("button", { name: /論文脈絡/ }).click();
  await page.locator("label", { hasText: PAPER_TITLE }).locator("input[type=checkbox]").check();

  const chip = page.getByTestId("context-chip");
  await expect(chip).toBeVisible({ timeout: 15000 });
  await expect(chip).toContainText("已注入 1 篇");
  await expect(chip).toContainText("6.0 萬字"); // 60k 截斷後的注入量
  await expect(chip).toContainText("部分截斷");
});

test("/review 命令：恰 1 篇 → 審查訊息 + 連結卡 + DB 落地", async ({ page, request }) => {
  const chatId = await createMockChat(request, [PAPER_ID]);
  await page.goto(`${BASE_URL}/chat/${chatId}`);

  const input = page.getByPlaceholder(/輸入訊息/);
  await input.fill("/rev");
  await expect(page.getByText("審查目前選擇的論文（需恰好 1 篇）")).toBeVisible(); // 命令選單
  await input.fill("/review");
  await page.getByTitle("送出").click();

  const main = page.getByRole("main");
  await expect(main.getByText(/已完成《.*》的審查/)).toBeVisible({ timeout: 60000 });
  await expect(main.getByText(/方法嚴謹度 7\/10/)).toBeVisible();
  await expect(main.getByTestId("chat-meta-card")).toHaveText("查看完整審查 →");

  const db = new Database(DB_PATH);
  const review = db.prepare(`SELECT result_json FROM reviews WHERE paper_id = ?`).get(PAPER_ID);
  db.close();
  expect(review).toBeTruthy();
  await page.screenshot({ path: "test-results/screenshots/v1.8-chat-review.png", fullPage: true });
});

test("/review 論文數不符 → 明確錯誤訊息", async ({ page, request }) => {
  const chatId = await createMockChat(request); // 0 篇
  await page.goto(`${BASE_URL}/chat/${chatId}`);
  await page.getByPlaceholder(/輸入訊息/).fill("/review");
  await page.getByTitle("送出").click();
  await expect(page.getByText(/需要在對話中恰好選擇 1 篇論文/)).toBeVisible({ timeout: 20000 });
});

test("/debate 命令：建辯論貼連結卡，逐字稿不進聊天室", async ({ page, request }) => {
  const chatId = await createMockChat(request, [PAPER_ID]);
  await page.goto(`${BASE_URL}/chat/${chatId}`);
  await page.getByPlaceholder(/輸入訊息/).fill(`/debate ${DEBATE_MOTION}`);
  await page.getByTitle("送出").click();

  const main = page.getByRole("main");
  await expect(main.getByText(/辯論已發起/)).toBeVisible({ timeout: 20000 });
  await expect(main.getByTestId("chat-meta-card")).toHaveText("前往辯論逐字稿 →");
  // 聊天室裡不出現辯論逐字稿內容
  await expect(main.getByText(/我方立場成立/)).toHaveCount(0);

  // 辯論真的在跑（mock 很快跑完）
  await expect
    .poll(
      async () => {
        const db = new Database(DB_PATH);
        const row = db.prepare(`SELECT status FROM debates WHERE motion = ?`).get(DEBATE_MOTION) as
          | { status: string }
          | undefined;
        db.close();
        return row?.status ?? "missing";
      },
      { timeout: 60000 }
    )
    .toBe("done");
});

test("傳圖：mock（API provider）附圖 → 縮圖與看圖回覆", async ({ page, request }) => {
  const chatId = await createMockChat(request);
  await page.goto(`${BASE_URL}/chat/${chatId}`);

  await expect(page.getByTestId("attach-image")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByPlaceholder(/輸入訊息/).fill("看一下這張圖");
  await page.getByTitle("送出").click();

  const main = page.getByRole("main");
  await expect(main.locator('img[alt="附加圖片"]')).toBeVisible({ timeout: 15000 });
  await expect(main.getByText(/【mock】已收到圖片/)).toBeVisible({ timeout: 20000 });
});

test("claude-cli 對話：附圖按鈕隱藏", async ({ page, request }) => {
  const res = await request.post(`${BASE_URL}/api/chat`, { data: {} }); // 預設 claude-cli
  const { id } = await res.json();
  chatIds.push(id);
  await page.goto(`${BASE_URL}/chat/${id}`);
  await expect(page.getByPlaceholder(/輸入訊息/)).toBeVisible();
  await expect(page.getByTestId("attach-image")).toHaveCount(0);
});
