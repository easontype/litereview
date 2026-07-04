import { defineConfig } from "@playwright/test";

// 全套 spec 共用同一顆 SQLite：各檔 beforeAll/afterAll 會設定/還原 llm_config 等 settings，
// 平行執行時先結束的檔案會把設定還原成真 provider、讓進行中的測試切到真 LLM 而 flake——
// 因此一律單 worker 序列跑。
export default defineConfig({
  testDir: "tests",
  workers: 1,
});
