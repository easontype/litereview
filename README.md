# litereview

個人文獻研究工具：搜尋 → 找重點 → 比較。詳見 [`PRD.md`](./PRD.md)、[`SDD.md`](./SDD.md)、[`SPEC.md`](./SPEC.md)。

## 需求

- Node.js 20+
- 已登入的 [Claude Code](https://claude.com/product/claude-code) CLI（`claude login`）—「找重點」「比較」走 CLI 訂閱 token，不需要 `ANTHROPIC_API_KEY`
- TODO（Phase 5 補完整）：Marker API（datalab.to）金鑰申請方式

## 啟動

```bash
npm install
cp .env.local.example .env.local   # 填入自己的變數
npm run dev
```

開啟 http://localhost:3000

## 環境變數

見 [`.env.local.example`](./.env.local.example)。`.env.local` 不進版控。

## 開發進度

見 [`phases/`](./phases) 各 phase 的 `phase.md` / `tasks.md`。
