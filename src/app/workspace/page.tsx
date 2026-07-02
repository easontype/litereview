"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface WorkspaceItem {
  id: string;
  title: string;
  source: string;
  arxivId: string | null;
  doi: string | null;
  addedAt: string;
  hasKeypoints: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  upload: "已上傳 PDF",
};

export default function WorkspacePage() {
  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/workspace/papers");
    const json = await res.json();
    setItems(json.items);
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => {
        if (!ignore) setItems(json.items);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleRemove(id: string) {
    await fetch(`/api/workspace/papers/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadTitle.trim()) form.append("title", uploadTitle.trim());

      const res = await fetch("/api/workspace/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "上傳失敗");

      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10">
      <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-tight">工作區</h1>
      <p className="mt-1.5 text-sm leading-[1.55] text-foreground/55">
        {items ? `${items.length} 篇論文` : "載入中…"}
      </p>

      <div className="mt-6 border border-black/10 px-4 py-3.5 dark:border-white/15">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
          上傳 PDF 加入工作區
        </h2>
        <form onSubmit={handleUpload} className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            required
            className="flex-1 text-xs text-foreground/60 file:mr-3 file:h-8 file:border file:border-black/15 file:bg-transparent file:px-3 file:text-xs file:font-medium file:text-foreground file:transition-colors hover:file:border-foreground/40 dark:file:border-white/15"
          />
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="標題（選填，預設用檔名）"
            className="h-8 flex-1 border border-black/15 bg-transparent px-2.5 text-sm placeholder:text-foreground/35 focus:border-foreground/40 focus:outline-none dark:border-white/15"
          />
          <button
            type="submit"
            disabled={uploading}
            className="h-8 shrink-0 border border-black/15 px-3 text-xs font-medium transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15"
          >
            {uploading ? "上傳中…" : "上傳"}
          </button>
        </form>
        {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
      </div>

      {items && items.length === 0 && (
        <p className="mt-8 text-sm leading-[1.7] text-foreground/45">
          尚未加入任何論文，先到搜尋頁挑幾篇。
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-8 divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-5">
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-lg font-semibold leading-[1.2] text-foreground">
                  {item.title || "（無標題）"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/45">
                  <span className="font-mono">{SOURCE_LABEL[item.source] ?? item.source}</span>
                  <span className="font-mono">{item.hasKeypoints ? "已完成" : "未分析"}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/workspace/${item.id}`}
                  className="flex h-8 items-center border border-black/15 px-3 text-xs font-medium transition-colors hover:border-foreground/40 dark:border-white/15"
                >
                  {item.hasKeypoints ? "查看重點" : "找重點"}
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="h-8 border border-black/15 px-3 text-xs font-medium text-foreground/60 transition-colors hover:border-red-400 hover:text-red-600 dark:border-white/15"
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
