"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MagnifyingGlass, Books, Columns, UploadSimple, SidebarSimple } from "@phosphor-icons/react";

interface SidebarPaper {
  id: string;
  title: string;
  hasKeypoints: boolean;
  fulltextSource: string | null;
}

interface SidebarComparison {
  id: string;
  paperIds: string[];
  titles: string[];
  createdAt: string;
}

function subscribeSidebarToggle(callback: () => void) {
  window.addEventListener("lr:sidebar-toggle", callback);
  return () => window.removeEventListener("lr:sidebar-toggle", callback);
}

/** 頁面完成新增/移除/分析/比較後呼叫 window.dispatchEvent(new Event("lr:refresh")) 讓側欄刷新。 */
export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [papers, setPapers] = useState<SidebarPaper[] | null>(null);
  const [comparisons, setComparisons] = useState<SidebarComparison[] | null>(null);
  const collapsed = useSyncExternalStore(
    subscribeSidebarToggle,
    () => localStorage.getItem("lr:sidebar") === "collapsed",
    () => false
  );

  const load = useCallback(() => {
    fetch("/api/workspace/papers")
      .then((res) => res.json())
      .then((json) => setPapers(json.items))
      .catch(() => {});
    fetch("/api/compare")
      .then((res) => res.json())
      .then((json) => setComparisons(json.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);

  useEffect(() => {
    window.addEventListener("lr:refresh", load);
    return () => window.removeEventListener("lr:refresh", load);
  }, [load]);

  function toggle() {
    localStorage.setItem("lr:sidebar", collapsed ? "open" : "collapsed");
    window.dispatchEvent(new Event("lr:sidebar-toggle"));
  }

  const activeCompareId = pathname.startsWith("/compare") ? searchParams.get("id") : null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="展開側邊欄"
        className="fixed left-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5"
      >
        <SidebarSimple size={17} />
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface px-2 pb-2 pt-3">
      <div className="flex items-center gap-2 px-2 pb-3">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-xs bg-primary font-serif text-[13px] font-bold text-on-primary">
          lr
        </span>
        <span className="text-[15px] font-semibold tracking-tight">litereview</span>
        <button
          type="button"
          onClick={toggle}
          title="收合側邊欄"
          className="ml-auto grid h-7 w-7 place-items-center rounded-sm text-slate transition-colors hover:bg-black/5"
        >
          <SidebarSimple size={16} />
        </button>
      </div>

      <SidebarLink href="/" active={pathname === "/"}>
        <MagnifyingGlass size={16} className="shrink-0 text-slate" />
        <span className="text-sm font-medium">搜尋文獻</span>
      </SidebarLink>

      <div className="mt-4">
        <Link
          href="/workspace"
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold text-steel transition-colors hover:bg-black/[0.045] ${
            pathname === "/workspace" ? "text-ink" : ""
          }`}
        >
          <Books size={15} className="shrink-0" />
          工作區
          {papers && <span className="ml-auto font-mono text-[11px] font-normal">{papers.length}</span>}
        </Link>
        {papers?.map((paper) => (
          <SidebarLink
            key={paper.id}
            href={`/workspace/${paper.id}`}
            active={pathname === `/workspace/${paper.id}`}
          >
            <StatusDot paper={paper} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{paper.title || "（無標題）"}</span>
          </SidebarLink>
        ))}
        {papers && papers.length === 0 && (
          <p className="px-2 py-1 text-xs text-steel">先到搜尋頁挑幾篇論文</p>
        )}
      </div>

      <div className="mt-4">
        <Link
          href="/compare"
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold text-steel transition-colors hover:bg-black/[0.045] ${
            pathname === "/compare" && !activeCompareId ? "text-ink" : ""
          }`}
        >
          <Columns size={15} className="shrink-0" />
          比較
          {comparisons && (
            <span className="ml-auto font-mono text-[11px] font-normal">{comparisons.length}</span>
          )}
        </Link>
        {comparisons?.map((cmp) => (
          <SidebarLink key={cmp.id} href={`/compare?id=${cmp.id}`} active={activeCompareId === cmp.id}>
            <span className="flex min-w-0 flex-1 flex-col items-start">
              <span className="max-w-full truncate text-[13px]">
                {cmp.titles.map((t) => shortTitle(t)).join(" / ")}
              </span>
              <span className="font-mono text-[11px] text-steel">
                {cmp.paperIds.length} 篇 · {cmp.createdAt.slice(5, 10)}
              </span>
            </span>
          </SidebarLink>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <Link
          href="/workspace"
          className="flex min-h-[34px] items-center gap-2 rounded-sm border border-dashed border-hairline-strong px-2 py-1.5 text-[13px] font-medium text-slate transition-colors hover:border-slate hover:text-ink"
        >
          <UploadSimple size={16} className="shrink-0" />
          上傳 PDF 加入工作區
        </Link>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative flex w-full items-center gap-2 rounded-sm px-2 py-1 transition-colors ${
        active
          ? "bg-primary-soft before:absolute before:-left-0.5 before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-full before:bg-primary"
          : "hover:bg-black/[0.045]"
      }`}
    >
      {children}
    </Link>
  );
}

function StatusDot({ paper }: { paper: SidebarPaper }) {
  if (paper.hasKeypoints && paper.fulltextSource === "abstract_only") {
    return <span title="僅摘要" className="h-1.5 w-1.5 shrink-0 rounded-full border-2 border-warning" />;
  }
  if (paper.hasKeypoints) {
    return <span title="已分析" className="h-2 w-2 shrink-0 rounded-full bg-success" />;
  }
  return <span title="未分析" className="h-[7px] w-[7px] shrink-0 rounded-full border border-hairline-strong" />;
}

/** 側欄比較項目的標題縮寫：取冒號前主標，再截 12 字。 */
function shortTitle(title: string): string {
  const head = title.split(":")[0].trim();
  return head.length > 14 ? `${head.slice(0, 14)}…` : head;
}
