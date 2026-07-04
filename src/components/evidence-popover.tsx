"use client";

import type { EvidenceItem } from "@/lib/keypoints/parse";

/**
 * 包住一段分析內容：有出處時加虛線底線，hover / 鍵盤 focus 顯示原文引文浮層；
 * 引文帶頁碼且本機有 PDF 時提供「開啟 PDF」跳到該頁。零依賴（純 CSS group-hover）。
 */
export function EvidenceHover({
  items,
  onOpenPdf,
  children,
}: {
  items?: EvidenceItem[];
  onOpenPdf?: (page: number) => void;
  children: React.ReactNode;
}) {
  if (!items || items.length === 0) return <>{children}</>;

  return (
    <span className="group relative inline">
      <span
        tabIndex={0}
        className="cursor-help underline decoration-hairline-strong decoration-dotted underline-offset-4 outline-none transition-colors group-hover:decoration-primary focus-visible:decoration-primary"
      >
        {children}
      </span>
      {/* pt-2 讓滑鼠能從觸發文字滑進浮層而不斷開 hover */}
      <span className="pointer-events-none absolute left-0 top-full z-30 hidden w-[min(360px,80vw)] pt-2 group-focus-within:block group-hover:block group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
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
