"use client";

import { useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";

type State =
  | { name: "idle" }
  | { name: "writing" }
  | { name: "done"; action: "created" | "updated" }
  | { name: "needsKey" }
  | { name: "error"; message: string };

/** 論文頁「寫回 Zotero」：把 keypoints 以子筆記寫回原 Zotero 條目；沒 API key 時就地引導輸入。 */
export function ZoteroWritebackButton({ paperId }: { paperId: string }) {
  const [state, setState] = useState<State>({ name: "idle" });
  const [keyInput, setKeyInput] = useState("");

  async function writeback() {
    setState({ name: "writing" });
    try {
      const res = await fetch(`/api/zotero/writeback/${encodeURIComponent(paperId)}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.needsApiKey) {
          setState({ name: "needsKey" });
          return;
        }
        throw new Error(json.error ?? "回寫失敗");
      }
      setState({ name: "done", action: json.action });
    } catch (err) {
      setState({ name: "error", message: err instanceof Error ? err.message : "回寫失敗" });
    }
  }

  async function saveKeyAndRetry(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setState({ name: "writing" });
    try {
      const res = await fetch("/api/settings/zotero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      if (!res.ok) throw new Error("儲存 API key 失敗");
      setKeyInput("");
      await writeback();
    } catch (err) {
      setState({ name: "error", message: err instanceof Error ? err.message : "儲存失敗" });
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={writeback}
        disabled={state.name === "writing"}
        className="rounded-sm border border-hairline-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-slate disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.name === "writing"
          ? "寫回中…"
          : state.name === "done"
            ? state.action === "created"
              ? "已寫回 ✓"
              : "已更新 ✓"
            : "寫回 Zotero"}
      </button>

      {state.name === "needsKey" && (
        <form
          onSubmit={saveKeyAndRetry}
          className="flex w-[320px] flex-col gap-1.5 rounded-md border border-hairline bg-surface-soft p-2.5"
        >
          <p className="text-xs leading-[1.5] text-slate">
            需要 Zotero API key（勾選 Allow write access）：
            <a
              href="https://www.zotero.org/settings/keys/new"
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              前往建立
              <ArrowSquareOut size={11} />
            </a>
          </p>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="貼上 API key"
              className="h-7 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-2 text-xs outline-none placeholder:text-steel focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
            <button
              type="submit"
              className="h-7 shrink-0 rounded-sm bg-primary px-2.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-pressed"
            >
              儲存並寫回
            </button>
          </div>
        </form>
      )}

      {state.name === "error" && <span className="max-w-[320px] text-right text-xs text-error">{state.message}</span>}
    </span>
  );
}
