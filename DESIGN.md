---
# variant: balanced（2026-07-03 由 /ds-brand 三變種中選定套用）
# meta（非 token，供後續 huashu-design / ui-ux-pro-max 交接使用）
source-reference: ".claude/tmp/reference-screenshot.png"
source-url: "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md"

colors:
  canvas:          "#ffffff"   # 主內容區背景（閱讀面）
  surface:         "#f6f8fa"   # 側邊欄 / 次要區塊背景（冷調淺灰）
  surface-soft:    "#fafbfc"   # hover / 斑馬紋底
  primary-soft:    "#eef6fd"   # 選取態 / 資訊區塊淺藍底
  primary-tint:    "#dcecfa"   # 強調淺藍面（badge 底、active 邊）
  ink:             "#1f2328"   # 主文字（冷調近黑）
  slate:           "#57606a"   # 次要文字
  steel:           "#8b949e"   # 第三層文字 / placeholder（僅限大文字或非必要資訊）
  hairline:        "#e3e8ee"   # 邊框 / 分隔線
  hairline-strong: "#c9d2dc"   # 輸入框邊框 / 較重分隔
  primary:         "#0075de"   # 主色：按鈕 / 連結 / active 指示
  primary-pressed: "#005bab"   # 主色按下態
  on-primary:      "#ffffff"   # 主色上的文字
  success:         "#1a7f37"   # 已分析 ✓
  warning:         "#9a6700"   # abstract_only 警示 / 分析中
  error:           "#d1242f"   # 失敗

typography:
  font-sans:  "Geist, Inter, ui-sans-serif, system-ui"
  font-mono:  "Geist Mono, ui-monospace"
  scale-ratio: 1.414           # 平衡版：√2，標題有存在感但不搶
  base-size:  "15px"
  weights: [400, 500, 600]
  line-height-body: 1.55
  line-height-heading: 1.25

spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]

radius:
  xs:   "4px"
  sm:   "4px"
  md:   "8px"
  lg:   "16px"
  pill: "9999px"

shadows:
  subtle: "0 1px 2px rgba(15,15,15,0.06), 0 1px 3px rgba(15,15,15,0.04)"
  medium: "0 2px 8px rgba(15,15,15,0.08)"
  popover: "0 4px 16px rgba(15,15,15,0.12)"
---

# litereview 設計系統

Notion 文書風 × 白/淺藍/藍色盤。個人論文研究工具：長文閱讀優先、操作簡潔、無多餘裝飾元素。

## 設計原則

1. **閱讀面純白**：keypoints / 比較表等長文內容一律 `canvas` 白底，最大化閱讀對比；淺灰 `surface` 只給側邊欄與輔助區塊。
2. **藍色只做訊號**：`primary` 藍保留給可點擊（按鈕、連結）與目前位置（active 指示），不拿來裝飾。大面積永遠是白/淺灰。
3. **邊界用 hairline，不用陰影**：區塊分隔優先 `1px hairline`，陰影只給浮層（popover / dropdown）。
4. **狀態用色點 + 文字**：論文分析狀態（✓ 已分析 / ⋯ 分析中 / ⚠ 僅摘要 / ✗ 失敗）用 12px 色點加文字標籤，不用大色塊。
5. **密度適中**：清單行高 ≥ 36px，區塊間距用 `spacing` 16/24，一屏約 12–15 篇論文。

## Components

### Sidebar
- background: `surface`
- width: 264px（可收合至 0）
- item height: 32px、radius: `radius.sm`、padding: `4px 8px`
- item hover: `rgba(0,0,0,0.04)`
- item active: background `primary-soft`、text `ink`、左側 2px `primary` 指示條
- 分組標題: 12px / 600 / `steel` / uppercase 不強制

### Button（primary）
- background: `primary`、text: `on-primary`
- radius: `radius.sm`、padding: `6px 14px`、font: 14px/500
- hover: `primary-pressed`
- disabled: background `hairline`、text `steel`

### Button（secondary / ghost）
- secondary: transparent + `1px solid hairline-strong`、text `ink`
- ghost: transparent、text `slate`、hover background `rgba(0,0,0,0.04)`

### Card（論文卡）
- background: `canvas`
- border: `1px solid hairline`、radius: `radius.md`
- padding: `16px`
- hover: border `hairline-strong`（不加陰影）

### Input / Search
- background: `canvas`、border: `1px solid hairline-strong`
- radius: `radius.sm`、padding: `8px 12px`
- focus: border `primary` + `2px primary-tint` ring
- placeholder: `steel`

### Tag / Badge
- 狀態徽章: background `primary-soft` 或語意色 8% 透明版、text 對應語意色
- radius: `radius.xs`、font: 12px/500、padding: `2px 8px`

### Table（比較表）
- header: `surface` 底、13px/600/`slate`
- row border: `1px solid hairline`、cell padding: `12px 16px`
- 斑馬紋: `surface-soft`（可選）

### 警示區塊（abstract_only）
- background: `#fff8e6`（warning 8% 淡底）、border-left: `3px solid warning`
- text: `ink`、icon/標題: `warning`

## WCAG AA 對比度（已驗證）

| 色對 | 對比度 | 要求 | 結果 |
|------|--------|------|------|
| ink on canvas | 15.9:1 | 4.5:1 | ✓ |
| ink on surface | 15.0:1 | 4.5:1 | ✓ |
| slate on canvas | 6.4:1 | 4.5:1 | ✓ |
| steel on canvas | 3.1:1 | 3:1（大文字） | ✓ |
| on-primary on primary | 4.6:1 | 4.5:1 | ✓ |
| primary on canvas（連結） | 4.6:1 | 4.5:1 | ✓ |
| success / warning / error on canvas | ≥ 4.8:1 | 4.5:1 | ✓ |
