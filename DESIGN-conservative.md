---
# variant: conservative
# base: ./DESIGN.md
# generated: 2026-07-03
source-reference: ".claude/tmp/reference-screenshot.png"
source-url: "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md"

colors:
  canvas:          "#ffffff"
  surface:         "#f9fafb"   # 極淡，幾乎無色的側欄底
  surface-soft:    "#fbfcfd"
  primary-soft:    "#f1f6fb"
  primary-tint:    "#e0ebf5"
  ink:             "#1f2328"
  slate:           "#57606a"
  steel:           "#8b949e"
  hairline:        "#e3e8ee"
  hairline-strong: "#c9d2dc"
  primary:         "#1674c8"   # S -20%，內斂的文書藍
  primary-pressed: "#11599a"
  on-primary:      "#ffffff"   # 對比 4.81:1 ✓
  success:         "#1a7f37"
  warning:         "#9a6700"
  error:           "#d1242f"

typography:
  font-sans:  "Geist, Inter, ui-sans-serif, system-ui"
  font-mono:  "Geist Mono, ui-monospace"
  scale-ratio: 1.25            # Minor Third，層級差異小、最像純文件
  base-size:  "15px"
  weights: [400, 500, 600]
  line-height-body: 1.55
  line-height-heading: 1.25

spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]

radius:
  xs:   "2px"
  sm:   "2px"
  md:   "4px"
  lg:   "8px"
  pill: "9999px"

shadows:
  subtle: "none"               # 全程 hairline border 分區，零陰影
  medium: "none"
  popover: "0 0 0 1px #e3e8ee" # 浮層也用邊線
---

# litereview 設計系統 — 保守版

最接近純文件的版本：零陰影、直角傾向（2–4px）、字級層差最小、側欄底色淡到接近白。適合想把工具「隱形」、只留內容的取向。其餘設計原則與元件規格同 `./DESIGN.md`，token 以本檔為準。
