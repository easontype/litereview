/**
 * Tier 1 內建 PDF 文字抽取（pdfjs-dist，零金鑰零外部安裝）。
 *
 * pdf.js 只給「PDF 內部繪製順序」的文字片段，學術論文常見雙欄排版直接串接會左右交錯。
 * 這裡做欄位感知線性化：行聚合 → 以頁面中線偵測左右欄與跨欄行 → 跨欄行（標題/摘要/圖表說明）
 * 當作垂直分隔帶，帶內先輸出整個左欄再輸出右欄。另過濾跨頁重複的頁首頁尾與純頁碼、合併斷字。
 * 品質目標是「LLM 讀得懂的線性文字」，不追求完美 Markdown。
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 100;

interface Fragment {
  x: number;
  y: number;
  w: number;
  str: string;
}

interface Line {
  y: number;
  xStart: number;
  xEnd: number;
  text: string;
  kind: "left" | "right" | "full";
}

function buildLines(fragments: Fragment[]): Omit<Line, "kind">[] {
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; frags: Fragment[] }[] = [];
  for (const frag of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - frag.y) <= 3) {
      current.frags.push(frag);
    } else {
      lines.push({ y: frag.y, frags: [frag] });
    }
  }
  return lines.map((line) => {
    const frags = [...line.frags].sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const f of frags) {
      if (prevEnd !== null && f.x - prevEnd > 1 && !text.endsWith(" ") && !f.str.startsWith(" ")) {
        text += " ";
      }
      text += f.str;
      prevEnd = f.x + f.w;
    }
    return {
      y: line.y,
      xStart: frags[0].x,
      xEnd: frags[frags.length - 1].x + frags[frags.length - 1].w,
      text: text.trim(),
    };
  });
}

/**
 * 分欄要在聚行「之前」做：雙欄頁左右兩欄同一 y 高度都有字，先聚行會把兩欄字黏成
 * 一條假的跨欄行。這裡以 fragment 為單位偵測——跨中線 gutter 的 fragment 很少、
 * 且左右兩側都有足量 fragment，才視為雙欄頁；然後左右欄與跨欄各自獨立聚行。
 */
function buildPageLines(fragments: Fragment[], pageWidth: number): { lines: Line[]; twoColumn: boolean } {
  const mid = pageWidth / 2;
  const gutter = pageWidth * 0.03;
  const crossing = new Set(fragments.filter((f) => f.x < mid - gutter && f.x + f.w > mid + gutter));
  const left = fragments.filter((f) => !crossing.has(f) && f.x + f.w / 2 < mid);
  const right = fragments.filter((f) => !crossing.has(f) && f.x + f.w / 2 >= mid);

  const twoColumn =
    fragments.length > 20 &&
    crossing.size / fragments.length < 0.1 &&
    left.length / fragments.length > 0.2 &&
    right.length / fragments.length > 0.2;

  if (!twoColumn) {
    return { lines: buildLines(fragments).map((l) => ({ ...l, kind: "full" as const })), twoColumn };
  }
  const lines: Line[] = [
    ...buildLines([...crossing]).map((l) => ({ ...l, kind: "full" as const })),
    ...buildLines(left).map((l) => ({ ...l, kind: "left" as const })),
    ...buildLines(right).map((l) => ({ ...l, kind: "right" as const })),
  ].sort((a, b) => b.y - a.y);
  return { lines, twoColumn };
}

/** 依 full 行切垂直帶，雙欄帶內先左欄後右欄，維持閱讀順序。 */
function linearizePage(lines: Line[], twoColumn: boolean): string[] {
  if (!twoColumn) return lines.map((l) => l.text);

  const out: string[] = [];
  let band: Line[] = [];
  const flushBand = () => {
    if (!band.length) return;
    out.push(...band.filter((l) => l.kind === "left").map((l) => l.text));
    out.push(...band.filter((l) => l.kind === "right").map((l) => l.text));
    band = [];
  };
  for (const line of lines) {
    if (line.kind === "full") {
      flushBand();
      out.push(line.text);
    } else {
      band.push(line);
    }
  }
  flushBand();
  return out;
}

/** 跨頁重複的短行（頁首頁尾）與純頁碼行，在多頁文件裡直接剔除。 */
function buildNoiseFilter(pages: Line[][]): (text: string) => boolean {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    for (const text of new Set(lines.filter((l) => l.text.length < 80).map((l) => l.text))) {
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.floor(pages.length / 2));
  return (text) => {
    if (pages.length > 2 && /^\d{1,4}$/.test(text)) return true;
    return (counts.get(text) ?? 0) >= threshold && pages.length >= 3;
  };
}

/** 合併斷字換行（行尾連字號 + 下一行小寫開頭），其餘行以換行串接。 */
function joinLines(texts: string[]): string {
  const out: string[] = [];
  for (const text of texts) {
    const prev = out[out.length - 1];
    if (prev && /[a-z]-$/.test(prev) && /^[a-z]/.test(text)) {
      out[out.length - 1] = prev.slice(0, -1) + text;
    } else {
      out.push(text);
    }
  }
  return out.join("\n");
}

export interface PdfTextResult {
  text: string;
  pageCount: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  try {
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const pages: Line[][] = [];
    const pageTwoColumn: boolean[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const { width } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const fragments: Fragment[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        fragments.push({ x: item.transform[4], y: item.transform[5], w: item.width, str: item.str });
      }
      const { lines, twoColumn } = buildPageLines(fragments, width);
      pages.push(lines);
      pageTwoColumn.push(twoColumn);
    }

    const isNoise = buildNoiseFilter(pages);
    // 頁碼標記要在過濾空頁「前」按實體頁索引加上，跳過空白頁時編號才對得上 PDF viewer 的 #page=N。
    const pageTexts = pages.map((lines, i) => {
      const kept = lines.filter((l) => !isNoise(l.text));
      const text = joinLines(linearizePage(kept, pageTwoColumn[i]));
      return text.trim() ? `【第 ${i + 1} 頁】\n${text}` : null;
    });
    return { text: pageTexts.filter((t): t is string => t !== null).join("\n\n"), pageCount };
  } finally {
    await doc.destroy();
  }
}
