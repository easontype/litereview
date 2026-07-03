---
# variant: bold
# base: ./DESIGN.md
# generated: 2026-07-03
source-reference: ".claude/tmp/reference-screenshot.png"
source-url: "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md"

colors:
  canvas:          "#ffffff"
  surface:         "#e8f0fa"   # 明顯的淺藍側欄底（強對比但維持淺色，遵守白/淺藍/藍前提）
  surface-soft:    "#f2f7fc"
  primary-soft:    "#eff6fd"
  primary-tint:    "#dce9f9"
  ink:             "#1f2328"
  slate:           "#57606a"
  steel:           "#8b949e"
  hairline:        "#d7e3f0"   # 邊線也帶藍調
  hairline-strong: "#b9cde3"
  primary:         "#005dca"   # 降 L 提濃 + 色相微轉，更電光的藍
  primary-pressed: "#004597"
  on-primary:      "#ffffff"   # 對比 6.14:1 ✓
  success:         "#1a7f37"
  warning:         "#9a6700"
  error:           "#d1242f"

typography:
  font-sans:  "Geist, Inter, ui-sans-serif, system-ui"
  font-mono:  "Geist Mono, ui-monospace"
  scale-ratio: 1.618           # 黃金比例，大標題非常突出
  base-size:  "15px"
  weights: [400, 500, 600]
  line-height-body: 1.55
  line-height-heading: 1.2

spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]

radius:
  xs:   "8px"
  sm:   "8px"
  md:   "16px"
  lg:   "20px"
  pill: "9999px"

shadows:
  subtle: "0 1px 3px rgba(15,15,15,0.08)"
  medium: "0 2px 8px rgba(15,15,15,0.10), 0 8px 24px -4px rgba(0,93,202,0.12)"  # 帶藍暈的擴散陰影
  popover: "0 8px 32px -4px rgba(0,93,202,0.18)"
---

# litereview 設計系統 — 大膽版

藍色存在感最強的版本：側欄整片淺藍、圓角大而柔、標題字級跳躍大、卡片帶藍暈陰影。仍是淺色系（依使用者前提，不做深底），但工具的「品牌感」明顯高於文件感。其餘設計原則與元件規格同 `./DESIGN.md`，token 以本檔為準。
