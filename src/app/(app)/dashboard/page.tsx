"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  UploadSimple,
  Command,
  Books,
  Sparkle,
  Columns,
  Scales,
  ClipboardText,
} from "@phosphor-icons/react";

interface DistBucket {
  label: string;
  count: number;
}

interface RecentEvent {
  type: "paper" | "keypoints" | "review" | "comparison" | "debate";
  label: string;
  href: string;
  at: string;
}

interface DashboardStats {
  counts: { papers: number; analyzed: number; reviews: number; comparisons: number; debates: number };
  noveltyDist: DistBucket[];
  reviewDist: DistBucket[];
  rankDist: DistBucket[];
  rankingsAvailable: boolean;
  recent: RecentEvent[];
}

const EVENT_META: Record<RecentEvent["type"], { label: string; Icon: typeof Books }> = {
  paper: { label: "加入論文", Icon: Books },
  keypoints: { label: "完成分析", Icon: Sparkle },
  review: { label: "完成審查", Icon: ClipboardText },
  comparison: { label: "建立比較", Icon: Columns },
  debate: { label: "發起辯論", Icon: Scales },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setStats(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入失敗"));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("lr:refresh", load);
    return () => window.removeEventListener("lr:refresh", load);
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-[880px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">儀表板</h1>
      <p className="mt-1.5 text-sm text-slate">研究進度總覽：工作區、分析、比較與辯論</p>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {/* 統計卡 */}
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard href="/workspace" label="工作區論文" value={stats?.counts.papers} />
        <StatCard
          href="/workspace"
          label="已分析"
          value={stats?.counts.analyzed}
          sub={stats && stats.counts.papers > 0 ? `${stats.counts.analyzed}/${stats.counts.papers}` : undefined}
        />
        <StatCard href="/compare" label="比較" value={stats?.counts.comparisons} />
        <StatCard href="/debate" label="辯論" value={stats?.counts.debates} />
      </div>

      {/* 快捷動作 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-sm border border-hairline-strong px-3 py-2 text-[13px] font-medium transition-colors hover:border-slate"
        >
          <MagnifyingGlass size={15} className="text-slate" />
          搜尋文獻
        </Link>
        <Link
          href="/workspace"
          className="flex items-center gap-2 rounded-sm border border-hairline-strong px-3 py-2 text-[13px] font-medium transition-colors hover:border-slate"
        >
          <UploadSimple size={15} className="text-slate" />
          上傳 PDF
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("lr:cmdk"))}
          className="flex items-center gap-2 rounded-sm border border-dashed border-hairline-strong px-3 py-2 text-[13px] font-medium text-slate transition-colors hover:border-slate hover:text-ink"
        >
          <Command size={15} />
          指令面板
          <kbd className="rounded-xs border border-hairline px-1.5 font-mono text-[11px] text-steel">⌘K</kbd>
        </button>
      </div>

      {/* 圖表 */}
      {stats && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <ChartCard title="新穎度分布" empty={stats.counts.analyzed === 0 ? "還沒有分析過的論文" : undefined}>
            <BarChart data={stats.noveltyDist} />
          </ChartCard>
          <ChartCard title="審查分數分布" empty={stats.counts.reviews === 0 ? "還沒有審查紀錄" : undefined}>
            <BarChart data={stats.reviewDist} />
          </ChartCard>
          <ChartCard
            title="期刊分級分布"
            empty={
              !stats.rankingsAvailable
                ? "先跑 npm run fetch:rankings 匯入分級表"
                : stats.rankDist.length === 0
                  ? "工作區還沒有論文"
                  : undefined
            }
          >
            <BarChart data={stats.rankDist} />
          </ChartCard>
        </div>
      )}

      {/* 最近活動 */}
      <div className="mt-9">
        <h2 className="text-sm font-semibold text-steel">最近活動</h2>
        {stats && stats.recent.length === 0 && (
          <p className="mt-3 text-sm text-steel">
            還沒有任何活動——先到
            <Link href="/search" className="mx-1 text-primary hover:underline">
              搜尋頁
            </Link>
            挑幾篇論文。
          </p>
        )}
        <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
          {stats?.recent.map((ev, i) => {
            const meta = EVENT_META[ev.type];
            return (
              <li key={`${ev.type}-${ev.href}-${i}`}>
                <Link href={ev.href} className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-black/[0.03]">
                  <meta.Icon size={15} className="shrink-0 text-slate" />
                  <span className="w-[72px] shrink-0 text-xs font-medium text-steel">{meta.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{ev.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-steel">{ev.at.slice(0, 10)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  sub,
}: {
  href: string;
  label: string;
  value: number | undefined;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-sm border border-hairline bg-surface px-4 py-3.5 transition-colors hover:border-hairline-strong"
    >
      <p className="text-xs font-medium text-steel">{label}</p>
      <p className="mt-1 font-serif text-[26px] font-bold leading-none">
        {value ?? "–"}
        {sub && <span className="ml-1.5 align-baseline font-sans text-xs font-normal text-steel">{sub}</span>}
      </p>
    </Link>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-hairline bg-surface px-4 py-3.5">
      <p className="text-xs font-medium text-steel">{title}</p>
      {empty ? <p className="mt-4 pb-2 text-xs text-steel">{empty}</p> : <div className="mt-3">{children}</div>}
    </div>
  );
}

/** 純 SVG 長條圖：不引入 chart 依賴，高度依最大值正規化。 */
function BarChart({ data }: { data: DistBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = 100 / data.length;
  const H = 64;
  return (
    <div>
      <svg viewBox={`0 0 100 ${H}`} className="h-[64px] w-full" preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const h = d.count === 0 ? 1.5 : (d.count / max) * (H - 6);
          return (
            <rect
              key={d.label}
              x={i * barW + barW * 0.18}
              y={H - h}
              width={barW * 0.64}
              height={h}
              rx={1}
              className={d.count === 0 ? "fill-hairline" : "fill-primary"}
            >
              <title>{`${d.label}：${d.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] text-steel">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
