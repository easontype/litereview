---
# variant: balanced
# base: ./DESIGN.md
# generated: 2026-07-03
source-reference: ".claude/tmp/reference-screenshot.png"
source-url: "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md"

colors:
  canvas:          "#ffffff"
  surface:         "#f6f8fa"   # 中等冷灰側欄底（最接近 Notion app 實際比例）
  surface-soft:    "#fafbfc"
  primary-soft:    "#eef6fd"
  primary-tint:    "#dcecfa"
  ink:             "#1f2328"
  slate:           "#57606a"
  steel:           "#8b949e"
  hairline:        "#e3e8ee"
  hairline-strong: "#c9d2dc"
  primary:         "#0075de"   # 原值（Notion link-blue）
  primary-pressed: "#005bab"
  on-primary:      "#ffffff"   # 對比 4.57:1 ✓
  success:         "#1a7f37"
  warning:         "#9a6700"
  error:           "#d1242f"

typography:
  font-sans:  "Geist, Inter, ui-sans-serif, system-ui"
  font-mono:  "Geist Mono, ui-monospace"
  scale-ratio: 1.414           # √2，標題有存在感但不搶
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

# litereview 設計系統 — 平衡版

與參考截圖（Notion app）比例最接近的版本：中等圓角、雙層極淡陰影只給浮層、側欄有可辨識但不搶眼的冷灰底。其餘設計原則與元件規格同 `./DESIGN.md`，token 以本檔為準。
