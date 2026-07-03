"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CaretRight, X } from "@phosphor-icons/react";

interface Collection {
  key: string;
  name: string;
  parentKey: string | null;
  numItems: number;
}

interface ImportItem {
  zoteroKey: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string;
  venue: string | null;
  issn: string | null;
  itemType: string;
  inWorkspace: boolean;
}

type Stage =
  | { name: "checking" }
  | { name: "offline" }
  | { name: "collections"; collections: Collection[] }
  | { name: "items"; collection: { key: string; name: string }; items: ImportItem[] }
  | { name: "importing" }
  | { name: "done"; imported: number; failed: string[] }
  | { name: "error"; message: string };

/** collections 攤平成「父在前、子縮排」的顯示順序。 */
function orderCollections(collections: Collection[]): Array<Collection & { depth: number }> {
  const byParent = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const list = byParent.get(c.parentKey) ?? [];
    list.push(c);
    byParent.set(c.parentKey, list);
  }
  const out: Array<Collection & { depth: number }> = [];
  function walk(parentKey: string | null, depth: number) {
    for (const c of byParent.get(parentKey) ?? []) {
      out.push({ ...c, depth });
      walk(c.key, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function ZoteroImportButton({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-hairline-strong bg-canvas px-3 text-xs font-medium transition-colors hover:border-slate"
      >
        <BookOpen size={14} />
        從 Zotero 匯入
      </button>
      {open && <ZoteroImportDialog onClose={() => setOpen(false)} onImported={onImported} />}
    </>
  );
}

export function ZoteroImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: "checking" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function loadCollections() {
    setStage({ name: "checking" });
    try {
      const status = await fetch("/api/zotero/status").then((r) => r.json());
      if (!status.running) {
        setStage({ name: "offline" });
        return;
      }
      const json = await fetch("/api/zotero/collections").then((r) => r.json());
      if (json.error) throw new Error(json.error);
      setStage({ name: "collections", collections: json.collections });
    } catch (err) {
      setStage({ name: "error", message: err instanceof Error ? err.message : "連線 Zotero 失敗" });
    }
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const status = await fetch("/api/zotero/status").then((r) => r.json());
        if (ignore) return;
        if (!status.running) {
          setStage({ name: "offline" });
          return;
        }
        const json = await fetch("/api/zotero/collections").then((r) => r.json());
        if (ignore) return;
        if (json.error) throw new Error(json.error);
        setStage({ name: "collections", collections: json.collections });
      } catch (err) {
        if (!ignore) {
          setStage({ name: "error", message: err instanceof Error ? err.message : "連線 Zotero 失敗" });
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function openCollection(key: string, name: string) {
    setStage({ name: "checking" });
    setSelected(new Set());
    try {
      const json = await fetch(`/api/zotero/collections/${encodeURIComponent(key)}/items`).then((r) =>
        r.json()
      );
      if (json.error) throw new Error(json.error);
      setStage({ name: "items", collection: { key, name }, items: json.items });
    } catch (err) {
      setStage({ name: "error", message: err instanceof Error ? err.message : "讀取條目失敗" });
    }
  }

  async function runImport(items: ImportItem[]) {
    const chosen = items.filter((it) => selected.has(it.zoteroKey));
    if (chosen.length === 0) return;
    setStage({ name: "importing" });
    try {
      const res = await fetch("/api/zotero/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "匯入失敗");
      setStage({ name: "done", imported: json.imported, failed: json.failed ?? [] });
      onImported();
    } catch (err) {
      setStage({ name: "error", message: err instanceof Error ? err.message : "匯入失敗" });
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectable = stage.name === "items" ? stage.items.filter((it) => !it.inWorkspace) : [];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="從 Zotero 匯入"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[72vh] w-full max-w-[560px] flex-col overflow-hidden rounded-md border border-hairline bg-canvas shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          {stage.name === "items" && (
            <button
              type="button"
              onClick={loadCollections}
              title="回 collection 清單"
              className="grid h-6 w-6 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5"
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <h2 className="text-sm font-semibold">
            {stage.name === "items" ? `Zotero · ${stage.collection.name}` : "從 Zotero 匯入"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="關閉"
            className="ml-auto grid h-6 w-6 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-[180px] flex-1 overflow-y-auto">
          {stage.name === "checking" && (
            <div className="flex items-center gap-2.5 px-4 py-6 text-sm text-slate">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              連線 Zotero 中…
            </div>
          )}

          {stage.name === "offline" && (
            <div className="px-4 py-6">
              <p className="text-sm text-ink">找不到本機的 Zotero。</p>
              <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-[13px] leading-[1.6] text-slate">
                <li>請先打開 Zotero 桌面版（需 Zotero 7 以上）</li>
                <li>
                  確認設定 → 進階 →「允許此電腦上的其他應用程式與 Zotero 通訊」已勾選（預設開啟）
                </li>
              </ol>
              <button
                type="button"
                onClick={loadCollections}
                className="mt-4 rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
              >
                重試
              </button>
            </div>
          )}

          {stage.name === "error" && (
            <div className="px-4 py-6">
              <p className="text-sm text-error">{stage.message}</p>
              <button
                type="button"
                onClick={loadCollections}
                className="mt-4 rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate"
              >
                重試
              </button>
            </div>
          )}

          {stage.name === "collections" && (
            <ul className="py-1.5">
              <CollectionRow
                name="全部條目"
                numItems={null}
                depth={0}
                onClick={() => openCollection("all", "全部條目")}
              />
              {orderCollections(stage.collections).map((c) => (
                <CollectionRow
                  key={c.key}
                  name={c.name}
                  numItems={c.numItems}
                  depth={c.depth}
                  onClick={() => openCollection(c.key, c.name)}
                />
              ))}
              {stage.collections.length === 0 && (
                <p className="px-4 py-3 text-[13px] text-steel">
                  沒有 collection，可從「全部條目」挑選。
                </p>
              )}
            </ul>
          )}

          {stage.name === "items" && (
            <ul className="divide-y divide-hairline">
              {stage.items.map((item) => (
                <li key={item.zoteroKey}>
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 px-4 py-2.5 transition-colors ${
                      item.inWorkspace ? "opacity-45" : "hover:bg-surface-soft"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.inWorkspace || selected.has(item.zoteroKey)}
                      disabled={item.inWorkspace}
                      onChange={() => toggle(item.zoteroKey)}
                      className="mt-0.5 h-[15px] w-[15px] shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium leading-[1.4]">
                        {item.title || "（無標題）"}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-steel">
                        {[
                          item.authors[0] && `${item.authors[0]}${item.authors.length > 1 ? " 等" : ""}`,
                          item.year,
                          item.arxivId ? `arXiv:${item.arxivId}` : item.doi,
                          item.inWorkspace && "已在工作區",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {stage.items.length === 0 && (
                <p className="px-4 py-6 text-[13px] text-steel">這個 collection 沒有可匯入的條目。</p>
              )}
            </ul>
          )}

          {stage.name === "importing" && (
            <div className="flex items-center gap-2.5 px-4 py-6 text-sm text-slate">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              匯入中，缺摘要的條目會用 DOI 補齊 metadata…
            </div>
          )}

          {stage.name === "done" && (
            <div className="px-4 py-6">
              <p className="text-sm text-success">已匯入 {stage.imported} 篇到工作區。</p>
              {stage.failed.length > 0 && (
                <p className="mt-2 text-[13px] text-error">失敗：{stage.failed.join("、")}</p>
              )}
            </div>
          )}
        </div>

        {stage.name === "items" && (
          <div className="flex items-center gap-3 border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setSelected(
                  selected.size === selectable.length
                    ? new Set()
                    : new Set(selectable.map((it) => it.zoteroKey))
                )
              }
              className="text-[13px] font-medium text-slate transition-colors hover:text-ink"
            >
              {selected.size === selectable.length && selectable.length > 0 ? "取消全選" : "全選"}
            </button>
            <span className="ml-auto text-[13px] text-slate">已選 {selected.size} 篇</span>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => runImport(stage.items)}
              className="rounded-sm bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-steel"
            >
              匯入
            </button>
          </div>
        )}

        {stage.name === "done" && (
          <div className="flex justify-end border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-pressed"
            >
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionRow({
  name,
  numItems,
  depth,
  onClick,
}: {
  name: string;
  numItems: number | null;
  depth: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        style={{ paddingLeft: `${16 + depth * 16}px` }}
        className="flex w-full items-center gap-2 py-2 pr-4 text-left transition-colors hover:bg-surface-soft"
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{name}</span>
        {numItems !== null && <span className="font-mono text-[11px] text-steel">{numItems}</span>}
        <CaretRight size={12} className="shrink-0 text-steel" />
      </button>
    </li>
  );
}
