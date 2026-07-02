import { test, expect } from "@playwright/test";
import path from "node:path";

const BASE_URL = "http://localhost:3000";

test("上傳 PDF 加入工作區，清單顯示已上傳項目；找重點顯示清楚的失敗訊息（無 MARKER_API_KEY）", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE_URL}/workspace`);

  await expect(page.getByText("上傳 PDF 加入工作區")).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join("D:/litereview", "tmp-test-paper.pdf"));

  await page.getByPlaceholder("標題（選填，預設用檔名）").fill("Playwright 上傳測試論文");
  await page.getByRole("button", { name: "上傳" }).click();

  const row = page.locator("li", { hasText: "Playwright 上傳測試論文" });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByText("已上傳 PDF")).toBeVisible();
  await expect(row.getByText("未分析")).toBeVisible();

  await row.getByRole("link", { name: "找重點" }).click();
  await expect(page.getByText(/找不到可分析的內容/)).toBeVisible({ timeout: 30000 });
});
