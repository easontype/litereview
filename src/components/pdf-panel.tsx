"use client";

import { X } from "@phosphor-icons/react";

/**
 * 本機 PDF 閱覽面板：iframe 走瀏覽器原生 viewer。
 * 換頁靠 key remount——iframe 只改 src 的 #hash 不會重新捲動，重載時 PDF 走 HTTP cache 很快。
 */
export function PdfPanel({
  paperId,
  page,
  title,
  onClose,
  fullWidth,
}: {
  paperId: string;
  page: number | null;
  title?: string;
  onClose?: () => void;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={
        fullWidth
          ? "flex h-full min-w-0 flex-1 flex-col"
          : "flex h-full w-[min(46vw,720px)] shrink-0 flex-col border-l border-hairline bg-surface"
      }
    >
      <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate">
          {title ?? "PDF"}
          {page !== null && ` · 第 ${page} 頁`}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="關閉 PDF"
            className="grid h-6 w-6 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <iframe
        key={`${paperId}-${page ?? 0}`}
        src={`/api/pdf/${paperId}#page=${page ?? 1}`}
        title="PDF 閱覽"
        className="min-h-0 w-full flex-1"
      />
    </div>
  );
}
