"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatCircleText, Plus, Trash } from "@phosphor-icons/react";

interface ChatListItem {
  id: string;
  title: string;
  updatedAt: string;
}

export default function ChatListPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetch("/api/chat")
      .then((res) => res.json())
      .then((json) => setChats(json.chats ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createChat() {
    setCreating(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (res.ok && json.id) {
        window.dispatchEvent(new Event("lr:refresh"));
        router.push(`/chat/${json.id}`);
        return;
      }
    } catch {
      // 建立失敗就留在清單頁
    }
    setCreating(false);
  }

  async function removeChat(id: string) {
    await fetch(`/api/chat/${id}`, { method: "DELETE" }).catch(() => {});
    window.dispatchEvent(new Event("lr:refresh"));
    load();
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[26px] font-bold leading-[1.3] tracking-[-0.3px]">對話</h1>
      <p className="mt-2 text-sm text-slate">
        帶著論文全文與模型自由對話；輸入 / 可直接觸發審查、比較、辯論。
      </p>

      <button
        type="button"
        onClick={createChat}
        disabled={creating}
        className="mt-6 flex min-h-[36px] items-center gap-2 rounded-sm bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={15} />
        {creating ? "建立中…" : "開新對話"}
      </button>

      <div className="mt-8">
        {chats === null && <p className="text-sm text-steel">載入中…</p>}
        {chats?.length === 0 && <p className="text-sm text-steel">還沒有對話。</p>}
        {chats?.map((chat) => (
          <div
            key={chat.id}
            className="group flex items-center gap-2 border-b border-hairline py-2.5"
          >
            <ChatCircleText size={16} className="shrink-0 text-slate" />
            <button
              type="button"
              onClick={() => router.push(`/chat/${chat.id}`)}
              className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
            >
              {chat.title}
            </button>
            <span className="shrink-0 font-mono text-[11px] text-steel">
              {chat.updatedAt.slice(5, 10)}
            </span>
            <button
              type="button"
              title="刪除對話"
              onClick={() => removeChat(chat.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-steel opacity-0 transition-colors hover:bg-black/5 hover:text-ink group-hover:opacity-100"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
