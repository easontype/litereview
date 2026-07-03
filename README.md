# litereview

個人文獻研究工具：**搜尋 → 找重點 → 比較**，一條龍完成。純本機執行、不需要帳號、不需要金流，資料只存在你自己的電腦上。

- **搜尋**：輸入關鍵字、arXiv ID 或 DOI，合併 OpenAlex / Semantic Scholar / arXiv 三個來源的結果並去重，附帶引用數與品質信號。
- **找重點**：對工作區裡的論文抓取全文（優先 arXiv，其次上傳 PDF，再其次 Unpaywall 開放取用版本），用 `claude -p` 深度分析出結構化重點（研究問題、方法、發現、貢獻、侷限性、新穎度…）；抓不到全文時退回「僅摘要」分析並明確標示。
- **比較**：勾選工作區裡 2–6 篇已分析的論文，產出五維度比較表（方法／實驗／貢獻／侷限性／新穎度）+ 一段綜合結論。

## 技術棧

Next.js 16（App Router）+ TypeScript + Tailwind CSS v4，`better-sqlite3` 本機資料庫，`@phosphor-icons/react` 提供側邊欄圖示。重量任務（找重點、比較）透過 `claude -p` CLI subprocess 呼叫，走你本機 Claude Code 訂閱的登入 token，**不吃 `ANTHROPIC_API_KEY`、不額外計費**。

## 前置需求

1. **Node.js 20+**
2. **Claude Code CLI 已安裝並登入**：找重點與比較功能透過本機 `claude` 指令執行，需要先跑過：
   ```bash
   claude login
   ```
   （用你的 Claude 訂閱帳號登入即可，不需要另外申請 API key）
3.（選用）**Marker API key**（`datalab.to`）：非 arXiv 來源的論文若要解析上傳 PDF 全文，需要這組金鑰。沒有的話系統會自動退回「僅摘要」分析，其餘功能不受影響。前往 [datalab.to](https://www.datalab.to) 註冊即可取得。

## 安裝與啟動

```bash
npm install
cp .env.local.example .env.local   # 編輯 .env.local 填入下方環境變數
npm run dev
```

預設跑在 `http://localhost:3000`（若被其他專案佔用，Next.js 會自動改用下一個可用 port，終端機訊息會顯示實際 port）。

## 環境變數（`.env.local`）

| 變數 | 必填 | 用途 |
|---|---|---|
| `MARKER_API_KEY` | 選用 | `datalab.to` Marker API 金鑰，用來解析非 arXiv 論文的上傳 PDF 全文。留空時只影響「上傳 PDF」這條全文抓取路徑，其餘功能（搜尋/找重點/比較）正常運作。 |
| `CONTACT_EMAIL` | 建議填 | OpenAlex 要求呼叫方在 User-Agent 帶上聯絡 email 才能進入「禮貌池」（更高速率限制），填你自己的 email 即可。 |

`.env.local` 已被 `.gitignore` 排除，不會進版控；repo 只保留 `.env.local.example` 範本。

## 使用流程

1. 左側邊欄「搜尋文獻」輸入關鍵字／arXiv ID／DOI → 對想追蹤的論文按「加入工作區」；找不到線上索引的論文也可以在「工作區」頁直接上傳 PDF 加入（側邊欄底部也有捷徑）
2. 到「工作區」頁，對任一篇論文按「找重點」→ 系統抓全文並跑深度分析（有全文的情況下通常 1–2 分鐘內完成）；側邊欄的論文清單會即時顯示分析狀態（綠點＝已分析、琥珀空心＝僅摘要、灰空心＝未分析）
3. 在「工作區」頁勾選 2–6 篇**已分析**的論文，畫面下方會浮出「比較」按鈕 → 按下後帶到「比較」頁預選這幾篇 → 執行比較取得五維度表格 + 綜合結論
4. 每次比較結果都會存檔，側邊欄「比較」區塊列出歷史紀錄，點擊可隨時回訪任一次的完整結果

側邊欄可收合（狀態記在瀏覽器 localStorage），收合後點左上角圖示可再展開。

## 資料存放

所有搜尋紀錄、工作區內容、分析結果都存在本機 SQLite 檔案 `data/litereview.db`，上傳的 PDF 原檔存在 `data/uploads/`，都不會上傳到任何伺服器，`.gitignore` 已排除整個 `data/` 目錄。

## 開發

```bash
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript 型別檢查
```

### 端對端測試

測試會自行播種資料（不依賴既有 DB 狀態），可整套連續跑。先在一個終端機啟動 server：

```bash
npm run build && npx next start -p 3010   # 或用 npm run dev 開發模式
```

再另開一個終端機執行測試，透過 `LR_BASE_URL` 指定 server 位址：

```bash
LR_BASE_URL=http://localhost:3010 npx playwright test tests --workers=1
```

> `phase3-keypoints.spec.ts` 與 `phase4-compare.spec.ts` 會真的呼叫 `claude -p` 跑分析，需要本機 `claude` CLI 已登入，執行時間可能長達數分鐘。

## 設計系統

UI 採側邊欄 App Shell 版型，配色與排版規則定義在 [`DESIGN.md`](./DESIGN.md)。

## License

[MIT](./LICENSE)
