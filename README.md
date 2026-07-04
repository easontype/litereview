# litereview

個人文獻研究工具：**搜尋 → 找重點 → 比較 → 審查 → 辯論**，一條龍完成。純本機執行、不需要帳號、不需要金流，資料只存在你自己的電腦上。

- **搜尋**：輸入關鍵字、arXiv ID 或 DOI，合併 OpenAlex / Semantic Scholar / arXiv 三個來源的結果並去重，附帶引用數、品質信號與期刊分級徽章（SJR Q1–Q4／CORE A*–C）。
- **找重點**：對工作區裡的論文抓取全文（優先 arXiv，其次上傳 PDF，再其次 Unpaywall 開放取用版本），用 LLM 深度分析出結構化重點（研究問題、方法、發現、貢獻、侷限性、新穎度…）；抓不到全文時退回「僅摘要」分析並明確標示。
- **比較**：勾選工作區裡 2–6 篇已分析的論文，產出五維度比較表（方法／實驗／貢獻／侷限性／新穎度）+ 一段綜合結論。
- **審查**：以審查委員視角給出五維評分 scorecard（方法嚴謹度／證據強度／新穎性／可重現性／清晰度）、優缺點清單，以及可供辯論的爭點。
- **辯論**：給定一個爭點（可從審查結果一鍵帶入），讓正反方模型針對論文證據多輪攻防，最後由裁判模型評分判決；逐字稿透過 SSE 即時呈現。
- **Zotero 整合**：從本機 Zotero 7 的 collection 匯入條目到工作區，分析完成後可把重點筆記回寫成 Zotero 子筆記。
- **儀表板**：工作區統計（論文數／已分析／審查／比較／辯論）、年份分佈長條圖、最近活動時間軸與快捷動作。
- **關係圖譜**：把工作區論文畫成力導向圖（d3-force），邊代表「比較過／辯論過／共同作者」，節點大小反映被引數、顏色反映分析狀態；拖曳、hover 資訊卡、點擊進論文頁。
- **⌘K 指令面板**：`Ctrl/⌘+K` 隨處喚起——跳頁、模糊搜尋工作區論文、直接對論文發起找重點、快查期刊分級。
- **即時串流**：找重點／比較以背景 job 執行，SSE 回報階段進度（抓全文→LLM 分析→完成）與耗時，離開頁面再回來會自動接上進行中的 job；辯論逐字稿逐 token 即時顯示。

## 技術棧

Next.js 16（App Router）+ TypeScript + Tailwind CSS v4，`better-sqlite3` 本機資料庫，`@phosphor-icons/react` 提供側邊欄圖示，`cmdk` 驅動指令面板，`d3-force` 負責關係圖譜的力學模擬（SVG 自繪）。

路由分兩個 route group：`/`（marketing）是靜態商品介紹頁，`(app)` 群組（`/dashboard`、`/search`、`/workspace`、`/compare`、`/debate`、`/journals`、`/graph`、`/settings`）才是側邊欄 App Shell。

LLM 呼叫走可調配的 adapter 層：預設 provider 是 `claude -p` CLI subprocess，用你本機 Claude Code 訂閱的登入 token，**不吃 `ANTHROPIC_API_KEY`、不額外計費**；也可在設定中心加入 OpenAI、Google Gemini、Anthropic API，或任何 OpenAI 相容端點（DeepSeek／Groq／本機 Ollama…）。

## 前置需求

1. **Node.js 20+**
2. **Claude Code CLI 已安裝並登入**：預設模型走本機 `claude` 指令，需要先跑過：
   ```bash
   claude login
   ```
   （用你的 Claude 訂閱帳號登入即可，不需要另外申請 API key；若你在設定中心把所有座位都指到其他家的 API，則可跳過這步）
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

`.env.local` 已被 `.gitignore` 排除，不會進版控；repo 只保留 `.env.local.example` 範本。其餘金鑰（各家模型 API key、Zotero API key）都在 app 內的「設定」頁輸入，只存本機 SQLite。

## 使用流程

0. 首頁 `/` 是商品介紹頁，按「進入工作台」到儀表板；app 內任何地方按 `Ctrl/⌘+K` 都能開指令面板快速跳頁或搜尋論文
1. 左側邊欄「搜尋文獻」輸入關鍵字／arXiv ID／DOI → 對想追蹤的論文按「加入工作區」；找不到線上索引的論文也可以在「工作區」頁直接上傳 PDF 加入（側邊欄底部也有捷徑）
2. 到「工作區」頁，對任一篇論文按「找重點」→ 系統抓全文並跑深度分析（有全文的情況下通常 1–2 分鐘內完成）；側邊欄的論文清單會即時顯示分析狀態（綠點＝已分析、琥珀空心＝僅摘要、灰空心＝未分析）
3. 在「工作區」頁勾選 2–6 篇**已分析**的論文，畫面下方會浮出「比較」按鈕 → 執行比較取得五維度表格 + 綜合結論；歷史紀錄在側邊欄「比較」區塊
4. 論文頁切到「審查」籤 → 執行審查取得 scorecard、優缺點與爭點；對任一爭點按「發起辯論」帶入辯題
5. 「辯論」頁選辯題與論文（1–6 篇）→ 開始辯論，即時看正反方攻防與裁判判決；歷史在側邊欄「辯論」區塊

側邊欄可收合（狀態記在瀏覽器 localStorage），收合後點左上角圖示可再展開。

## Zotero 整合

- **匯入**：打開本機 Zotero 7（它會在 `localhost:23119` 開本機 API），側邊欄按「從 Zotero 匯入」→ 選 collection → 勾選條目匯入工作區。Zotero 沒開時會顯示引導，不算錯誤。
- **回寫筆記**：到「設定」頁貼上 Zotero Web API key（[zotero.org/settings/keys](https://www.zotero.org/settings/keys) 申請，需勾選 write 權限）。之後對從 Zotero 匯入且已分析的論文，論文頁會出現「寫回 Zotero」按鈕，把重點寫成該條目底下的子筆記（重複回寫會更新同一則筆記，不會疊加）。

## 期刊分級表

搜尋結果與工作區會顯示 SJR quartile（Q1–Q4）與 CORE 會議分級（A*–C）徽章，「期刊分級」頁可直接查詢任一期刊／會議。分級資料需先跑一次 ingestion（下載 Scimago SJR 全期刊 CSV + CORE 會議清單進本機 DB，約 5 萬筆）：

```bash
npm run fetch:rankings
```

沒跑過 ingestion 時 UI 優雅降級（不顯示徽章），其餘功能不受影響。

## 模型設定中心（`/settings`）

六個座位（找重點／比較／審查員／辯論正方／辯論反方／辯論裁判）可各自指定供應商與模型：

- 內建 **Claude Code CLI（訂閱）**：零額外花費，是所有座位的預設，不可移除。
- 可新增 **OpenAI／Google Gemini／Anthropic API／OpenAI 相容端點**（填自訂 Base URL，支援 DeepSeek、Groq、Ollama 等）；每個 provider 有「測試連線」按鈕驗證 key。
- 辯論建議讓反方或裁判用非同家模型，避免模型自我偏好。
- 所有 API key 只存本機 SQLite（`data/` 已被 gitignore），UI 永遠只顯示遮罩後的預覽。
- **Mock（測試用）** provider 回傳罐頭回應，供端對端測試與展示，不呼叫任何模型。

## 資料存放

所有搜尋紀錄、工作區內容、分析／審查／辯論結果、API key 都存在本機 SQLite 檔案 `data/litereview.db`，上傳的 PDF 原檔存在 `data/uploads/`，都不會上傳到任何伺服器，`.gitignore` 已排除整個 `data/` 目錄。

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

> - `phase3-keypoints.spec.ts` 與 `phase4-compare.spec.ts` 會真的呼叫 `claude -p` 跑分析，需要本機 `claude` CLI 已登入，執行時間可能長達數分鐘。
> - `v1.2-*.spec.ts`（設定／審查／辯論）全程走 mock provider，零模型花費，測試前後會自動備份與還原你的 LLM 設定。

## 設計系統

UI 採側邊欄 App Shell 版型，配色與排版規則定義在 [`DESIGN.md`](./DESIGN.md)。

## License

[MIT](./LICENSE)
