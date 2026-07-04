"use client";

import { useEffect, useState } from "react";
import { FilePdf } from "@phosphor-icons/react";
import { PdfPanel } from "@/components/pdf-panel";

interface PdfItem {
  id: string;
  title: string;
  source: string;
  hasPdf?: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  upload: "上傳",
  arxiv: "arXiv",
  openalex: "OpenAlex",
  "semantic-scholar": "Semantic Scholar",
};

/** 工具頁：列出工作區裡有本機 PDF 的論文，點開即在右側閱覽。 */
export default function PdfsPage() {
  const [items, setItems] = useState<PdfItem[] | null>(null);
  const [selected, setSelected] = useState<PdfItem | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => {
        if (ignore) return;
        const withPdf = (json.items as PdfItem[]).filter((it) => it.hasPdf);
        setItems(withPdf);
        setSelected((prev) => prev ?? withPdf[0] ?? null);
      })
      .catch(() => {
        if (!ignore) setItems([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-hairline">
        <div className="border-b border-hairline px-5 pb-4 pt-8">
          <h1 className="font-serif text-[22px] font-bold leading-[1.3]">PDF 閱覽</h1>
          <p className="mt-1 text-[12px] leading-[1.6] text-steel">工作區裡有本機 PDF 的論文</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {items === null && <p className="px-5 py-2 text-sm text-steel">載入中…</p>}
          {items?.length === 0 && (
            <p className="px-5 py-2 text-[13px] leading-[1.7] text-steel">
              還沒有本機 PDF——上傳 PDF 或分析有開放取用全文的論文後，就會出現在這裡。
            </p>
          )}
          {items?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className={`flex w-full items-start gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-black/[0.03] ${
                selected?.id === item.id ? "bg-black/[0.045]" : ""
              }`}
            >
              <FilePdf size={16} className="mt-0.5 shrink-0 text-slate" />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium leading-[1.5]">
                  {item.title || "（無標題）"}
                </span>
                <span className="font-mono text-[11px] text-steel">
                  {SOURCE_LABEL[item.source] ?? item.source}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <PdfPanel paperId={selected.id} page={null} title={selected.title} fullWidth />
      ) : (
        <div className="grid flex-1 place-items-center text-sm text-steel">
          {items?.length === 0 ? "沒有可閱覽的 PDF" : "從左側選一份 PDF"}
        </div>
      )}
    </div>
  );
}
