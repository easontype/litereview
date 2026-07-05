"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, CaretDown, Files, Image as ImageIcon, Scales, Columns, MagnifyingGlass, X } from "@phosphor-icons/react";

interface ChatMeta {
  id: string;
  title: string;
  providerId: string;
  model: string;
  paperIds: string[];
}

interface MessageMeta {
  kind: "review" | "compare" | "debate" | "error";
  paperId?: string;
  compareId?: string;
  debateId?: string;
  motion?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images: string[];
  meta: MessageMeta | null;
  createdAt: string;
}

interface InjectedPaper {
  paperId: string;
  title: string;
  chars: number;
  truncated: boolean;
}

interface ProviderInfo {
  id: string;
  kind: string;
  label: string;
  models: string[];
}

interface WorkspacePaper {
  id: string;
  title: string;
}

const COMMANDS = [
  { name: "/review", desc: "審查目前選擇的論文（需恰好 1 篇）", Icon: MagnifyingGlass },
  { name: "/compare", desc: "比較目前選擇的論文（需 ≥2 篇）", Icon: Columns },
  { name: "/debate ", desc: "/debate <辯題>：對選擇的論文發起辯論", Icon: Scales },
];

function formatChars(chars: number): string {
  return chars >= 10000 ? `${(chars / 10000).toFixed(1)} 萬字` : `${chars} 字`;
}

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [papers, setPapers] = useState<WorkspacePaper[]>([]);
  const [papersOpen, setPapersOpen] = useState(false);
  const [injected, setInjected] = useState<InjectedPaper[] | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewFetched = useRef(false);

  const provider = providers.find((p) => p.id === meta?.providerId);
  const supportsImages = Boolean(provider && provider.kind !== "claude-cli");

  const attachJob = useCallback(
    (jobId: string) => {
      esRef.current?.close();
      const es = new EventSource(`/api/jobs/${jobId}/events`);
      esRef.current = es;
      es.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as { type: string; data: unknown };
        if (event.type === "token") {
          setStage(null);
          setLive((prev) => (prev ?? "") + (event.data as { text: string }).text);
        } else if (event.type === "stage") {
          setStage((event.data as { message: string }).message);
        } else if (event.type === "context") {
          setInjected((event.data as { injected: InjectedPaper[] }).injected);
        } else if (event.type === "done") {
          es.close();
          setStage(null);
          fetch(`/api/chat/${id}`)
            .then((res) => res.json())
            .then((json) => {
              setMessages(json.messages ?? []);
              setLive(null);
            })
            .catch(() => setLive(null));
        } else if (event.type === "failed") {
          es.close();
          setStage(null);
          setLive(null);
          setError((event.data as { error: string }).error);
        }
      };
      es.onerror = () => {
        // job 已不在（如 server 重啟）：退回 DB 現況
        es.close();
        setStage(null);
        setLive(null);
        fetch(`/api/chat/${id}`)
          .then((res) => res.json())
          .then((json) => setMessages(json.messages ?? []))
          .catch(() => {});
      };
    },
    [id]
  );

  useEffect(() => {
    let ignore = false;
    fetch(`/api/chat/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (ignore) return;
        if (!json?.chat) {
          setNotFound(true);
          return;
        }
        setMeta(json.chat);
        setMessages(json.messages ?? []);
        if (json.activeJobId) attachJob(json.activeJobId);
      });
    fetch("/api/settings/llm")
      .then((res) => res.json())
      .then((json) => {
        if (!ignore) setProviders(json.providers ?? []);
      })
      .catch(() => {});
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => {
        if (!ignore) setPapers(json.items ?? []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
      esRef.current?.close();
    };
  }, [id, attachJob]);

  // 進頁時算一次注入預覽（PATCH 空 patch 會回 injected，順手暖 fulltexts 快取）
  useEffect(() => {
    if (!meta || previewFetched.current) return;
    previewFetched.current = true;
    if (meta.paperIds.length === 0) return;
    fetch(`/api/chat/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((res) => res.json())
      .then((json) => setInjected(json.injected ?? null))
      .catch(() => {});
  }, [meta, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, live, stage]);

  async function patchChat(patch: Record<string, unknown>) {
    const res = await fetch(`/api/chat/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok && json.chat) {
      setMeta(json.chat);
      setInjected(json.injected ?? null);
      setError(null);
    } else {
      if (json.error) setError(json.error);
      // 樂觀更新失敗：以伺服器現況 resync
      fetch(`/api/chat/${id}`)
        .then((r) => r.json())
        .then((j) => j.chat && setMeta(j.chat))
        .catch(() => {});
    }
  }

  function togglePaper(paperId: string) {
    if (!meta) return;
    const next = meta.paperIds.includes(paperId)
      ? meta.paperIds.filter((p) => p !== paperId)
      : [...meta.paperIds, paperId];
    // 樂觀更新讓勾選立即生效，注入字數等 PATCH 回應再補
    setMeta({ ...meta, paperIds: next });
    void patchChat({ paperIds: next });
  }

  async function send() {
    const text = input.trim();
    if ((!text && files.length === 0) || sending || live !== null) return;
    setSending(true);
    setError(null);
    try {
      let res: Response;
      if (files.length > 0) {
        const form = new FormData();
        form.set("text", text);
        for (const file of files) form.append("images", file);
        res = await fetch(`/api/chat/${id}/messages`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/chat/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "送出失敗");
        return;
      }
      setInput("");
      setFiles([]);
      const refreshed = await fetch(`/api/chat/${id}`).then((r) => r.json());
      setMeta(refreshed.chat ?? null);
      setMessages(refreshed.messages ?? []);
      window.dispatchEvent(new Event("lr:refresh"));
      setLive("");
      attachJob(json.jobId);
    } finally {
      setSending(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-10">
        <p className="text-sm text-steel">找不到這個對話。</p>
        <Link href="/chat" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← 回對話清單
        </Link>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-10">
        <p className="text-sm text-steel">載入中…</p>
      </div>
    );
  }

  const showCommands = input.startsWith("/") && !input.includes("\n");
  const commandMatches = COMMANDS.filter((c) => c.name.trim().startsWith(input.split(/\s/)[0]));
  const busy = live !== null || sending;

  return (
    <div className="mx-auto flex h-full w-full max-w-[760px] flex-col px-8">
      {/* ── 標頭：標題 + 模型選擇 + 論文脈絡 ── */}
      <div className="border-b border-hairline pb-3 pt-8">
        <Link href="/chat" className="text-xs text-steel hover:text-primary">
          ← 對話
        </Link>
        <h1 className="mt-1 truncate font-serif text-[22px] font-bold leading-[1.3] tracking-[-0.3px]">
          {meta.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={`${meta.providerId}::${meta.model}`}
            onChange={(e) => {
              const [providerId, model] = e.target.value.split("::");
              void patchChat({ providerId, model });
            }}
            className="h-7 rounded-sm border border-hairline bg-canvas px-2 text-xs text-slate outline-none"
          >
            {providers.map((p) =>
              p.models.map((m) => (
                <option key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                  {p.label} · {m}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => setPapersOpen((o) => !o)}
            className="flex h-7 items-center gap-1.5 rounded-sm border border-hairline px-2 text-xs text-slate transition-colors hover:border-slate hover:text-ink"
          >
            <Files size={13} />
            論文脈絡 {meta.paperIds.length}/3
            <CaretDown size={11} className={papersOpen ? "rotate-180" : ""} />
          </button>
          {injected && injected.length > 0 && (
            <span data-testid="context-chip" className="text-xs text-steel">
              已注入 {injected.length} 篇 ·{" "}
              {formatChars(injected.reduce((sum, p) => sum + p.chars, 0))}
              {injected.some((p) => p.truncated) && "（部分截斷）"}
            </span>
          )}
        </div>
        {papersOpen && (
          <div className="mt-2 max-h-[200px] overflow-y-auto rounded-sm border border-hairline bg-surface p-2">
            {papers.length === 0 && <p className="px-1 py-2 text-xs text-steel">工作區還沒有論文。</p>}
            {papers.map((p) => {
              const checked = meta.paperIds.includes(p.id);
              const disabled = !checked && meta.paperIds.length >= 3;
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-black/[0.045] ${
                    disabled ? "cursor-not-allowed opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => togglePaper(p.id)}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{p.title || "（無標題）"}</span>
                  {checked && injected?.find((inj) => inj.paperId === p.id) && (
                    <span className="shrink-0 font-mono text-[11px] text-steel">
                      {formatChars(injected.find((inj) => inj.paperId === p.id)!.chars)}
                      {injected.find((inj) => inj.paperId === p.id)!.truncated && "·截斷"}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 訊息列 ── */}
      <div className="flex-1 overflow-y-auto py-6">
        {messages.length === 0 && live === null && (
          <p className="py-10 text-center text-sm text-steel">
            送出第一則訊息開始對話；輸入 / 可觸發審查、比較、辯論。
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {live !== null && (
          <div className="mb-4 flex justify-start">
            <div className="max-w-[85%] rounded-md border border-hairline bg-canvas px-3.5 py-2.5 text-sm leading-relaxed">
              <span className="whitespace-pre-wrap">{live}</span>
              <span className="ml-0.5 inline-block h-[14px] w-[7px] animate-pulse bg-primary align-text-bottom" />
            </div>
          </div>
        )}
        {stage && <p className="text-center font-mono text-xs text-steel">{stage}</p>}
        {error && (
          <p className="mt-2 rounded-sm border border-warning bg-warning-soft px-3 py-2 text-xs text-ink">
            ⚠ {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── 輸入區 ── */}
      <div className="relative border-t border-hairline pb-6 pt-3">
        {showCommands && commandMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-[340px] rounded-md border border-hairline bg-canvas p-1 shadow-popover">
            {commandMatches.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setInput(c.name)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-primary-soft"
              >
                <c.Icon size={14} className="shrink-0 text-slate" />
                <span className="font-mono text-[13px]">{c.name.trim()}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-steel">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="flex items-center gap-1 rounded-sm border border-hairline px-2 py-0.5 text-xs text-slate"
              >
                <ImageIcon size={12} />
                {file.name}
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          {supportsImages && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((prev) => [...prev, ...picked].slice(0, 3));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                title="附加圖片"
                data-testid="attach-image"
                onClick={() => fileInputRef.current?.click()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-hairline text-slate transition-colors hover:border-slate hover:text-ink"
              >
                <ImageIcon size={16} />
              </button>
            </>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            placeholder={busy ? "回覆生成中…" : "輸入訊息（/ 觸發命令，Enter 送出）"}
            disabled={busy}
            className="min-h-[36px] flex-1 resize-none rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-steel focus:border-primary disabled:opacity-60"
          />
          <button
            type="button"
            title="送出"
            onClick={() => void send()}
            disabled={busy || (!input.trim() && files.length === 0)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-primary text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? "bg-primary-soft" : "border border-hairline bg-canvas"
        }`}
      >
        {msg.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {msg.images.map((name) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={name}
                src={`/api/chat/images/${name}`}
                alt="附加圖片"
                className="max-h-40 rounded-sm border border-hairline"
              />
            ))}
          </div>
        )}
        {msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>}
        <MetaCard meta={msg.meta} />
      </div>
    </div>
  );
}

function MetaCard({ meta }: { meta: MessageMeta | null }) {
  if (!meta || meta.kind === "error") return null;
  const href =
    meta.kind === "debate"
      ? `/debate/${meta.debateId}`
      : meta.kind === "compare"
        ? `/compare?id=${meta.compareId}`
        : `/workspace/${meta.paperId}`;
  const label =
    meta.kind === "debate" ? "前往辯論逐字稿 →" : meta.kind === "compare" ? "查看完整比較 →" : "查看完整審查 →";
  return (
    <Link
      href={href}
      data-testid="chat-meta-card"
      className="mt-2 block rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
    >
      {label}
    </Link>
  );
}
