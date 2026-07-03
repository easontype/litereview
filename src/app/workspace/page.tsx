"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface WorkspaceItem {
  id: string;
  title: string;
  source: string;
  arxivId: string | null;
  doi: string | null;
  addedAt: string;
  hasKeypoints: boolean;
  fulltextSource: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  upload: "已上傳 PDF",
};

function Status({ item }: { item: WorkspaceItem }) {
  if (item.hasKeypoints && item.fulltextSource === "abstract_only") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning">
        <span className="h-1.5 w-1.5 rounded-full border-2 border-warning" />
        僅摘要
      </span>
    );
  }
  if (item.hasKeypoints) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success">
        <span className="h-2 w-2 rounded-full bg-success" />
        已分析
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-steel">
      <span className="h-[7px] w-[7px] rounded-full border border-hairline-strong" />
      未分析
    </span>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });
  }

  async function handleRemove(id: string) {
    await fetch(`/api/workspace/papers/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    load();
    window.dispatchEvent(new Event("lr:refresh"));
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
      window.dispatchEvent(new Event("lr:refresh"));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">工作區</h1>
      <p className="mt-1.5 text-sm text-slate">
        {items ? `${items.length} 篇論文` : "載入中…"} · 勾選 2–6 篇已分析的論文可發起比較
      </p>

      <div id="upload" className="mt-6 rounded-md border border-hairline bg-surface-soft px-4 py-3.5">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          上傳 PDF 加入工作區
        </h2>
        <form onSubmit={handleUpload} className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            required
            className="flex-1 text-xs text-slate file:mr-3 file:h-8 file:rounded-sm file:border file:border-hairline-strong file:bg-canvas file:px-3 file:text-xs file:font-medium file:text-ink file:transition-colors hover:file:border-slate"
          />
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="標題（選填，預設用檔名）"
            className="h-8 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2.5 text-sm outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
          <button
            type="submit"
            disabled={uploading}
            className="h-8 shrink-0 rounded-sm border border-hairline-strong bg-canvas px-3 text-xs font-medium transition-colors hover:border-slate disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? "上傳中…" : "上傳"}
          </button>
        </form>
        {uploadError && <p className="mt-2 text-xs text-error">{uploadError}</p>}
      </div>

      {items && items.length === 0 && (
        <p className="mt-8 text-sm text-steel">尚未加入任何論文，先到搜尋頁挑幾篇。</p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                disabled={!item.hasKeypoints || (!selected.has(item.id) && selected.size >= 6)}
                title={item.hasKeypoints ? "勾選加入比較" : "分析完成後才能比較"}
                className="h-[15px] w-[15px] shrink-0 accent-primary disabled:opacity-35"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-serif text-base font-semibold leading-[1.3]">
                  {item.title || "（無標題）"}
                </h2>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-[11px] text-steel">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  <Status item={item} />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/workspace/${item.id}`}
                  className="rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
                >
                  {item.hasKeypoints ? "查看重點" : "找重點"}
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="rounded-sm px-2.5 py-1.5 text-[13px] font-medium text-slate transition-colors hover:bg-black/5 hover:text-error"
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.size >= 2 && (
        <div className="pointer-events-none sticky bottom-6 mt-6 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-hairline bg-canvas py-2.5 pl-4 pr-3 text-[13px] text-slate shadow-[var(--shadow-popover)]">
            <span>已選 {selected.size} 篇</span>
            <button
              type="button"
              onClick={() => router.push(`/compare?ids=${[...selected].join(",")}`)}
              className="rounded-sm bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed"
            >
              比較
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
