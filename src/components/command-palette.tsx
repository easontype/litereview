"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Books,
  Columns,
  Scales,
  GearSix,
  Medal,
  Graph,
  SquaresFour,
  SidebarSimple,
  Sparkle,
  ArrowRight,
  FilePdf,
} from "@phosphor-icons/react";

interface PaletteItemPaper {
  id: string;
  title: string;
  hasKeypoints: boolean;
}

interface JournalHit {
  name: string;
  issn: string | null;
  rank: { sjrQuartile: string | null; coreRank: string | null } | null;
}

const NAV: Array<{ href: string; label: string; keywords: string; Icon: typeof Books }> = [
  { href: "/dashboard", label: "儀表板", keywords: "dashboard home 首頁", Icon: SquaresFour },
  { href: "/workspace", label: "工作區", keywords: "workspace papers 論文", Icon: Books },
  { href: "/pdfs", label: "PDF 閱覽", keywords: "pdf viewer 閱覽", Icon: FilePdf },
  { href: "/compare", label: "比較", keywords: "compare 比較", Icon: Columns },
  { href: "/debate", label: "辯論", keywords: "debate 辯論", Icon: Scales },
  { href: "/journals", label: "期刊分級", keywords: "journals ranking sjr core 期刊", Icon: Medal },
  { href: "/graph", label: "關係圖譜", keywords: "graph 圖譜", Icon: Graph },
  { href: "/settings", label: "設定", keywords: "settings 模型 設定", Icon: GearSix },
];

/** ⌘K / Ctrl+K 指令面板：跳頁、模糊搜工作區論文、發起找重點、期刊分級快查。 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<PaletteItemPaper[]>([]);
  const [journalHits, setJournalHits] = useState<JournalHit[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // 開/關都重置輸入（關閉時重置無害，避免在 updater 內讀狀態）
        setQuery("");
        setJournalHits([]);
        setOpen((o) => !o);
      }
    };
    const onOpen = () => {
      setQuery("");
      setJournalHits([]);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("lr:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lr:cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => setPapers(json.items ?? []))
      .catch(() => {});
  }, [open]);

  // 期刊分級快查（純本地資料，debounce 200ms）
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setJournalHits([]);
        return;
      }
      fetch(`/api/journals?q=${encodeURIComponent(q)}&local=1`)
        .then((res) => res.json())
        .then((json) => setJournalHits(json.hits ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function toggleSidebar() {
    setOpen(false);
    const collapsed = localStorage.getItem("lr:sidebar") === "collapsed";
    localStorage.setItem("lr:sidebar", collapsed ? "open" : "collapsed");
    window.dispatchEvent(new Event("lr:sidebar-toggle"));
  }

  function startKeypoints(paperId: string) {
    setOpen(false);
    // 先開 job 再跳頁；論文頁載入時會偵測進行中 job 並掛上 SSE（job endpoint 會去重）
    fetch(`/api/keypoints/${paperId}/job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
    router.push(`/workspace/${paperId}`);
  }

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const navMatches = q
    ? NAV.filter((n) => n.label.toLowerCase().includes(q) || n.keywords.toLowerCase().includes(q))
    : NAV;
  const paperMatches = (q ? papers.filter((p) => p.title.toLowerCase().includes(q)) : papers).slice(0, 8);
  const unanalyzed = paperMatches.filter((p) => !p.hasKeypoints).slice(0, 4);
  const showSidebarToggle = !q || "收合側邊欄 展開 sidebar".includes(q);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[14vh]"
      onMouseDown={() => setOpen(false)}
    >
      <Command
        shouldFilter={false}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-[580px] max-w-[92vw] overflow-hidden rounded-md border border-hairline bg-canvas shadow-popover"
        label="指令面板"
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="搜尋論文、跳頁、查期刊分級…"
          className="h-12 w-full border-b border-hairline bg-transparent px-4 text-[15px] outline-none placeholder:text-steel"
        />
        <Command.List className="max-h-[380px] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-8 text-center text-sm text-steel">沒有符合的結果</Command.Empty>

          {navMatches.length > 0 && (
            <Command.Group heading={<GroupHeading>前往</GroupHeading>}>
              {navMatches.map((n) => (
                <Command.Item key={n.href} value={`nav-${n.href}`} onSelect={() => go(n.href)} className={ITEM_CLS}>
                  <n.Icon size={16} className="shrink-0 text-slate" />
                  <span className="text-sm">{n.label}</span>
                  <ArrowRight size={13} className="ml-auto text-steel opacity-0 group-data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
              {showSidebarToggle && (
                <Command.Item value="action-sidebar" onSelect={toggleSidebar} className={ITEM_CLS}>
                  <SidebarSimple size={16} className="shrink-0 text-slate" />
                  <span className="text-sm">收合／展開側邊欄</span>
                </Command.Item>
              )}
            </Command.Group>
          )}

          {paperMatches.length > 0 && (
            <Command.Group heading={<GroupHeading>工作區論文</GroupHeading>}>
              {paperMatches.map((p) => (
                <Command.Item
                  key={p.id}
                  value={`paper-${p.id}`}
                  onSelect={() => go(`/workspace/${p.id}`)}
                  className={ITEM_CLS}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      p.hasKeypoints ? "bg-success" : "border border-hairline-strong"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.title || "（無標題）"}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {unanalyzed.length > 0 && (
            <Command.Group heading={<GroupHeading>發起找重點</GroupHeading>}>
              {unanalyzed.map((p) => (
                <Command.Item
                  key={`kp-${p.id}`}
                  value={`kp-${p.id}`}
                  onSelect={() => startKeypoints(p.id)}
                  className={ITEM_CLS}
                >
                  <Sparkle size={16} className="shrink-0 text-slate" />
                  <span className="min-w-0 flex-1 truncate text-sm">找重點：{p.title || "（無標題）"}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {journalHits.length > 0 && (
            <Command.Group heading={<GroupHeading>期刊分級</GroupHeading>}>
              {journalHits.map((h, i) => (
                <Command.Item
                  key={`jr-${h.issn ?? h.name}-${i}`}
                  value={`jr-${h.issn ?? h.name}-${i}`}
                  onSelect={() => go(`/journals?q=${encodeURIComponent(h.name)}`)}
                  className={ITEM_CLS}
                >
                  <Medal size={16} className="shrink-0 text-slate" />
                  <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                  {h.rank?.sjrQuartile && (
                    <span className="shrink-0 rounded-xs bg-primary px-1.5 py-0.5 font-mono text-[10px] text-on-primary">
                      {h.rank.sjrQuartile}
                    </span>
                  )}
                  {h.rank?.coreRank && (
                    <span className="shrink-0 rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-slate">
                      CORE {h.rank.coreRank}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 font-mono text-[10.5px] text-steel">
          <span>↑↓ 選擇</span>
          <span>↵ 前往</span>
          <span>esc 關閉</span>
        </div>
      </Command>
    </div>
  );
}

const ITEM_CLS =
  "group flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 data-[selected=true]:bg-primary-soft";

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="block px-2.5 pb-1 pt-2 text-[11px] font-semibold text-steel">{children}</span>
  );
}
