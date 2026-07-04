"use client";

import { useState } from "react";
import type { EvidenceItem } from "@/lib/keypoints/parse";

/**
 * 包住一段分析內容：有出處時加虛線底線，hover / 鍵盤 focus 顯示原文引文浮層；
 * 引文帶頁碼且本機有 PDF 時提供「開啟 PDF」跳到該頁。零依賴（純 CSS group-hover）。
 * strategy="fixed"：浮層改 position:fixed 並在 hover/focus 時以 getBoundingClientRect 定位，
 * 給 overflow 容器（如比較表的 overflow-x-auto）內使用，避免浮層被裁切；預設 "absolute" 行為不變。
 */
export function EvidenceHover({
  items,
  onOpenPdf,
  strategy = "absolute",
  children,
}: {
  items?: EvidenceItem[];
  onOpenPdf?: (page: number) => void;
  strategy?: "absolute" | "fixed";
  children: React.ReactNode;
}) {
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null);

  if (!items || items.length === 0) return <>{children}</>;

  const isFixed = strategy === "fixed";
  const place = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth * 0.8);
    setFixedPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom,
    });
  };

  return (
    <span
      className="group relative inline"
      {...(isFixed
        ? {
            onMouseEnter: (e: React.MouseEvent<HTMLSpanElement>) => place(e.currentTarget),
            onFocusCapture: (e: React.FocusEvent<HTMLSpanElement>) => place(e.currentTarget),
          }
        : {})}
    >
      <span
        tabIndex={0}
        className="cursor-help underline decoration-hairline-strong decoration-dotted underline-offset-4 outline-none transition-colors group-hover:decoration-primary focus-visible:decoration-primary"
      >
        {children}
      </span>
      {/* pt-2 讓滑鼠能從觸發文字滑進浮層而不斷開 hover */}
      <span
        className={`pointer-events-none z-30 hidden w-[min(360px,80vw)] pt-2 group-focus-within:block group-hover:block group-hover:pointer-events-auto group-focus-within:pointer-events-auto ${
          isFixed ? "fixed" : "absolute left-0 top-full"
        }`}
        style={isFixed ? { left: fixedPos?.left ?? -9999, top: fixedPos?.top ?? 0 } : undefined}
      >
        <span className="block rounded-md border border-hairline bg-canvas p-3.5 shadow-lg">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">
            原文出處
          </span>
          {items.map((item, i) => (
            <span key={i} className={`block ${i > 0 ? "mt-3 border-t border-hairline pt-3" : "mt-2"}`}>
              <span className="block text-[13px] leading-[1.65] text-ink">「{item.quote}」</span>
              <span className="mt-1.5 flex items-center gap-2">
                {item.page !== null && (
                  <span className="font-mono text-[11px] text-slate">第 {item.page} 頁</span>
                )}
                {item.page !== null && onOpenPdf && (
                  <button
                    type="button"
                    onClick={() => onOpenPdf(item.page as number)}
                    className="rounded-xs border border-hairline-strong px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:border-primary"
                  >
                    開啟 PDF
                  </button>
                )}
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
