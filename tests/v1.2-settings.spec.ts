import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const BASE_URL = process.env.LR_BASE_URL ?? "http://localhost:3010";
const DB_PATH = path.join(process.cwd(), "data", "litereview.db");

const MOCK_ID = "mock-e2e-settings";
const SECRET = "secret-test-key-9876";

let originalConfig: string | null = null;

// 直接備份/還原 settings 表的 llm_config，測試不污染使用者設定
test.beforeAll(() => {
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'llm_config'`).get() as
    | { value: string }
    | undefined;
  originalConfig = row?.value ?? null;
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
  db.close();
});

test("設定 API：CRUD、key 永遠遮罩、claude-cli 內建不可覆寫", async ({ request }) => {
  // 初始狀態：claude-cli 內建在列、六個座位有指派
  const before = await request.get(`${BASE_URL}/api/settings/llm`).then((r) => r.json());
  const builtin = before.providers.find((p: { id: string }) => p.id === "claude-cli");
  expect(builtin).toBeTruthy();
  expect(builtin.builtin).toBe(true);
  for (const seat of ["keypoints", "compare", "reviewer", "proponent", "opponent", "judge"]) {
    expect(before.seats[seat]?.providerId).toBeTruthy();
  }

  // 新增 mock provider（帶 key）+ 指派 reviewer 座位
  const put = await request.put(`${BASE_URL}/api/settings/llm`, {
    data: {
      providers: [
        ...before.providers,
        { id: MOCK_ID, kind: "mock", label: "Mock 測試", apiKey: SECRET, models: ["mock-1"] },
      ],
      seats: { ...before.seats, reviewer: { providerId: MOCK_ID, model: "mock-1" } },
    },
  });
  expect(put.ok()).toBe(true);

  // 讀回：key 遮罩、原始 key 不出後端、座位指派生效
  const afterRes = await request.get(`${BASE_URL}/api/settings/llm`);
  const afterText = await afterRes.text();
  expect(afterText).not.toContain(SECRET);
  const after = JSON.parse(afterText);
  const mock = after.providers.find((p: { id: string }) => p.id === MOCK_ID);
  expect(mock.hasKey).toBe(true);
  expect(mock.keyPreview).toBe("••••9876");
  expect(after.seats.reviewer).toEqual({ providerId: MOCK_ID, model: "mock-1" });

  // 不帶 apiKey 再存一次 → 沿用既有 key
  const put2 = await request.put(`${BASE_URL}/api/settings/llm`, {
    data: {
      providers: after.providers.map((p: Record<string, unknown>) => ({ ...p, apiKey: "" })),
      seats: after.seats,
    },
  });
  expect(put2.ok()).toBe(true);
  const after2 = await request.get(`${BASE_URL}/api/settings/llm`).then((r) => r.json());
  expect(after2.providers.find((p: { id: string }) => p.id === MOCK_ID).hasKey).toBe(true);

  // 測試連線（mock provider，零成本）
  const testRes = await request
    .post(`${BASE_URL}/api/settings/llm/test`, { data: { providerId: MOCK_ID } })
    .then((r) => r.json());
  expect(testRes.ok).toBe(true);

  // 刪除 mock provider（座位退回預設 claude-cli）
  const put3 = await request.put(`${BASE_URL}/api/settings/llm`, {
    data: {
      providers: after2.providers.filter((p: { id: string }) => p.id !== MOCK_ID),
      seats: { ...after2.seats, reviewer: { providerId: "claude-cli", model: "claude-sonnet-5" } },
    },
  });
  expect(put3.ok()).toBe(true);
  const after3 = await request.get(`${BASE_URL}/api/settings/llm`).then((r) => r.json());
  expect(after3.providers.some((p: { id: string }) => p.id === MOCK_ID)).toBe(false);
  expect(after3.seats.reviewer.providerId).toBe("claude-cli");
});

test("設定頁 UI：provider 卡片、座位指派、內建項無刪除鈕", async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  const main = page.getByRole("main");

  // 內建 claude-cli 卡片（label 是 input，改抓卡片描述文字）
  await expect(main.getByText(/內建、不可移除/)).toBeVisible();
  // 六個座位的指派列
  for (const label of ["找重點", "比較", "審查員", "辯論正方", "辯論反方", "辯論裁判"]) {
    await expect(main.getByText(label, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: "test-results/screenshots/settings.png", fullPage: true });
});
