import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export interface GraphNode {
  id: string;
  title: string;
  year: number | null;
  citationCount: number | null;
  hasKeypoints: boolean;
  hasReview: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "compared" | "debated" | "coauthor";
}

interface NodeRow {
  id: string;
  title: string;
  year: number | null;
  citationCount: number | null;
  authors: string;
  hasKeypoints: number;
  hasReview: number;
}

/** 圖譜資料：節點＝工作區論文；邊＝比較過（實線）/ 辯論過（虛線）/ 共同作者（淡線）。 */
export async function GET() {
  const nodes = db
    .prepare(
      `SELECT p.id id, p.title title, p.year year, p.citation_count citationCount, p.authors authors,
              (k.paper_id IS NOT NULL) hasKeypoints, (r.paper_id IS NOT NULL) hasReview
       FROM workspace_items w
       JOIN papers p ON p.id = w.paper_id
       LEFT JOIN keypoints k ON k.paper_id = p.id
       LEFT JOIN reviews r ON r.paper_id = p.id
       ORDER BY w.added_at DESC`
    )
    .all() as NodeRow[];

  const inWorkspace = new Set(nodes.map((n) => n.id));
  const edges = new Map<string, GraphEdge>();

  function addEdge(a: string, b: string, type: GraphEdge["type"]) {
    if (a === b || !inWorkspace.has(a) || !inWorkspace.has(b)) return;
    const [s, t] = a < b ? [a, b] : [b, a];
    const key = `${s}|${t}|${type}`;
    if (!edges.has(key)) edges.set(key, { source: s, target: t, type });
  }

  function addPairs(idsJson: string, type: GraphEdge["type"]) {
    const ids = JSON.parse(idsJson) as string[];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) addEdge(ids[i], ids[j], type);
    }
  }

  for (const row of db.prepare("SELECT paper_ids FROM comparisons").all() as Array<{ paper_ids: string }>) {
    addPairs(row.paper_ids, "compared");
  }
  for (const row of db.prepare("SELECT paper_ids FROM debates").all() as Array<{ paper_ids: string }>) {
    addPairs(row.paper_ids, "debated");
  }

  // 共同作者：正規化姓名後兩兩比對（工作區規模小，O(n²) 可接受）
  const authorSets = nodes.map((n) => {
    try {
      return new Set((JSON.parse(n.authors) as string[]).map((a) => a.trim().toLowerCase()).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  });
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      for (const author of authorSets[i]) {
        if (authorSets[j].has(author)) {
          addEdge(nodes[i].id, nodes[j].id, "coauthor");
          break;
        }
      }
    }
  }

  return NextResponse.json({
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      year: n.year,
      citationCount: n.citationCount,
      hasKeypoints: Boolean(n.hasKeypoints),
      hasReview: Boolean(n.hasReview),
    })),
    edges: [...edges.values()],
  });
}
