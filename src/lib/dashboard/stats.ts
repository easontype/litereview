import { db } from "@/lib/db";
import { getRank, rankingsAvailable } from "@/lib/rankings/lookup";
import type { ReviewData } from "@/lib/review/parse";

export interface DistBucket {
  label: string;
  count: number;
}

export interface RecentEvent {
  type: "paper" | "keypoints" | "review" | "comparison" | "debate";
  label: string;
  href: string;
  at: string;
}

export interface DashboardStats {
  counts: {
    papers: number;
    analyzed: number;
    reviews: number;
    comparisons: number;
    debates: number;
  };
  noveltyDist: DistBucket[];
  reviewDist: DistBucket[];
  rankDist: DistBucket[];
  rankingsAvailable: boolean;
  recent: RecentEvent[];
}

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

export function getDashboardStats(): DashboardStats {
  const counts = {
    papers: count("SELECT COUNT(*) n FROM workspace_items"),
    analyzed: count(
      "SELECT COUNT(*) n FROM workspace_items w JOIN keypoints k ON k.paper_id = w.paper_id"
    ),
    reviews: count(
      "SELECT COUNT(*) n FROM workspace_items w JOIN reviews r ON r.paper_id = w.paper_id"
    ),
    comparisons: count("SELECT COUNT(*) n FROM comparisons"),
    debates: count("SELECT COUNT(*) n FROM debates"),
  };

  // 新穎度分布：keypoints.novelty_rating 為 High / Medium / Low
  const noveltyDist: DistBucket[] = [
    { label: "High", count: 0 },
    { label: "Medium", count: 0 },
    { label: "Low", count: 0 },
  ];
  const noveltyRows = db
    .prepare(
      "SELECT k.novelty_rating r FROM workspace_items w JOIN keypoints k ON k.paper_id = w.paper_id"
    )
    .all() as Array<{ r: string | null }>;
  for (const { r } of noveltyRows) {
    const norm = String(r ?? "").trim().toLowerCase();
    const bucket = noveltyDist.find((b) => b.label.toLowerCase() === norm);
    if (bucket) bucket.count++;
  }

  // 審查分數分布：五維平均取整 1–10
  const reviewDist: DistBucket[] = Array.from({ length: 10 }, (_, i) => ({
    label: String(i + 1),
    count: 0,
  }));
  const reviewRows = db.prepare("SELECT result_json FROM reviews").all() as Array<{
    result_json: string;
  }>;
  for (const row of reviewRows) {
    try {
      const data = JSON.parse(row.result_json) as ReviewData;
      const scores = Object.values(data.scores).map((s) => s.score);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      if (avg >= 1 && avg <= 10) reviewDist[avg - 1].count++;
    } catch {
      // 舊資料格式不符時跳過該筆
    }
  }

  // 期刊分級分布（工作區論文；未匯入分級表時回空）
  const hasRankings = rankingsAvailable();
  const rankCounts = new Map<string, number>();
  if (hasRankings) {
    const wsPapers = db
      .prepare(
        "SELECT p.issn issn, p.venue venue FROM workspace_items w JOIN papers p ON p.id = w.paper_id"
      )
      .all() as Array<{ issn: string | null; venue: string | null }>;
    for (const p of wsPapers) {
      const rank = getRank(p.issn, p.venue);
      const label = rank?.sjrQuartile ?? (rank?.coreRank ? `CORE ${rank.coreRank}` : "未分級");
      rankCounts.set(label, (rankCounts.get(label) ?? 0) + 1);
    }
  }
  const RANK_ORDER = ["Q1", "Q2", "Q3", "Q4", "CORE A*", "CORE A", "CORE B", "CORE C", "未分級"];
  const rankDist: DistBucket[] = [...rankCounts.entries()]
    .map(([label, c]) => ({ label, count: c }))
    .sort((a, b) => {
      const ia = RANK_ORDER.indexOf(a.label);
      const ib = RANK_ORDER.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  // 最近活動：各表事件合併取最新 12 筆
  const events: RecentEvent[] = [];
  const paperRows = db
    .prepare(
      "SELECT p.id id, p.title title, w.added_at at FROM workspace_items w JOIN papers p ON p.id = w.paper_id"
    )
    .all() as Array<{ id: string; title: string; at: string }>;
  for (const r of paperRows)
    events.push({ type: "paper", label: r.title, href: `/workspace/${r.id}`, at: r.at });

  const kpRows = db
    .prepare(
      "SELECT p.id id, p.title title, k.analyzed_at at FROM keypoints k JOIN papers p ON p.id = k.paper_id"
    )
    .all() as Array<{ id: string; title: string; at: string }>;
  for (const r of kpRows)
    events.push({ type: "keypoints", label: r.title, href: `/workspace/${r.id}`, at: r.at });

  const rvRows = db
    .prepare(
      "SELECT p.id id, p.title title, r.created_at at FROM reviews r JOIN papers p ON p.id = r.paper_id"
    )
    .all() as Array<{ id: string; title: string; at: string }>;
  for (const r of rvRows)
    events.push({ type: "review", label: r.title, href: `/workspace/${r.id}`, at: r.at });

  const cmpRows = db
    .prepare("SELECT id, paper_ids, created_at at FROM comparisons")
    .all() as Array<{ id: string; paper_ids: string; at: string }>;
  for (const r of cmpRows) {
    const n = (JSON.parse(r.paper_ids) as string[]).length;
    events.push({ type: "comparison", label: `${n} 篇論文比較`, href: `/compare?id=${r.id}`, at: r.at });
  }

  const dbRows = db
    .prepare("SELECT id, motion, created_at at FROM debates")
    .all() as Array<{ id: string; motion: string; at: string }>;
  for (const r of dbRows)
    events.push({ type: "debate", label: r.motion, href: `/debate/${r.id}`, at: r.at });

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    counts,
    noveltyDist,
    reviewDist,
    rankDist,
    rankingsAvailable: hasRankings,
    recent: events.slice(0, 12),
  };
}
