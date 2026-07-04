"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";

interface GraphNodeData {
  id: string;
  title: string;
  year: number | null;
  citationCount: number | null;
  hasKeypoints: boolean;
  hasReview: boolean;
}

interface SimNode extends GraphNodeData, SimulationNodeDatum {}

interface SimEdge {
  source: string | SimNode;
  target: string | SimNode;
  type: "compared" | "debated" | "coauthor";
}

const W = 920;
const H = 560;

/** 節點半徑：被引數 log 縮放 6–16px。 */
function radius(n: GraphNodeData): number {
  const c = n.citationCount ?? 0;
  return Math.min(16, 6 + Math.log10(Math.max(1, c)) * 2.2);
}

function nodeFill(n: GraphNodeData): string {
  if (n.hasReview) return "var(--success)";
  if (n.hasKeypoints) return "var(--primary)";
  return "var(--hairline-strong)";
}

export default function GraphPage() {
  const router = useRouter();
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState<SimNode | null>(null);
  const [, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<SimNode | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/graph")
      .then((res) => res.json())
      .then((json: { nodes: GraphNodeData[]; edges: SimEdge[] }) => {
        if (ignore) return;
        const simNodes: SimNode[] = json.nodes.map((n) => ({ ...n }));
        const simEdges: SimEdge[] = json.edges.map((e) => ({ ...e }));
        const sim = forceSimulation<SimNode>(simNodes)
          .force(
            "link",
            forceLink<SimNode, SimEdge & { source: SimNode | string; target: SimNode | string }>(
              simEdges as Array<SimEdge & { source: SimNode; target: SimNode }>
            )
              .id((d) => d.id)
              .distance(96)
              .strength(0.5)
          )
          .force("charge", forceManyBody().strength(-240))
          .force("center", forceCenter(W / 2, H / 2))
          .force("collide", forceCollide<SimNode>((d) => radius(d) + 10));
        sim.on("tick", () => setTick((t) => t + 1));
        simRef.current = sim;
        setNodes(simNodes);
        setEdges(simEdges);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      ignore = true;
      simRef.current?.stop();
    };
  }, []);

  function svgPoint(ev: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * W,
      y: ((ev.clientY - rect.top) / rect.height) * H,
    };
  }

  function onPointerDown(node: SimNode, ev: React.PointerEvent) {
    ev.preventDefault();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    dragRef.current = node;
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.3).restart();
  }

  function onPointerMove(ev: React.PointerEvent) {
    const node = dragRef.current;
    if (!node) return;
    const p = svgPoint(ev);
    node.fx = p.x;
    node.fy = p.y;
  }

  function onPointerUp() {
    const node = dragRef.current;
    if (!node) return;
    node.fx = null;
    node.fy = null;
    dragRef.current = null;
    simRef.current?.alphaTarget(0);
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-8 pb-24 pt-10">
      <h1 className="font-serif text-[30px] font-bold leading-[1.25] tracking-[-0.3px]">關係圖譜</h1>
      <p className="mt-1.5 text-sm text-slate">
        節點＝工作區論文（大小＝被引數、顏色＝分析狀態）；拖曳可調整佈局，點節點進論文頁
      </p>

      {loaded && nodes.length === 0 && (
        <p className="mt-8 text-sm text-steel">
          工作區還沒有論文——先到
          <Link href="/search" className="mx-1 text-primary hover:underline">
            搜尋頁
          </Link>
          加幾篇，比較或辯論之後，這裡會長出關係網。
        </p>
      )}

      {nodes.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-success" /> 已審查
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> 已分析
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-hairline-strong" /> 未分析
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--slate)" strokeWidth="1.8" /></svg>
              比較過
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--slate)" strokeWidth="1.8" strokeDasharray="4 3" /></svg>
              辯論過
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--hairline-strong)" strokeWidth="1.2" /></svg>
              共同作者
            </span>
          </div>

          <div className="relative mt-4 overflow-hidden rounded-md border border-hairline bg-surface-soft">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full touch-none select-none"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {edges.map((e, i) => {
                const s = e.source as SimNode;
                const t = e.target as SimNode;
                if (typeof s === "string" || typeof t === "string") return null;
                const style =
                  e.type === "compared"
                    ? { stroke: "var(--slate)", strokeWidth: 1.8, dash: undefined }
                    : e.type === "debated"
                      ? { stroke: "var(--slate)", strokeWidth: 1.8, dash: "5 4" }
                      : { stroke: "var(--hairline-strong)", strokeWidth: 1.1, dash: undefined };
                return (
                  <line
                    key={i}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.dash}
                    opacity={0.75}
                  />
                );
              })}
              {nodes.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? W / 2},${n.y ?? H / 2})`}
                  className="cursor-pointer"
                  onPointerDown={(ev) => onPointerDown(n, ev)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered((prev) => (prev?.id === n.id ? null : prev))}
                  onClick={() => {
                    if (!dragRef.current) router.push(`/workspace/${n.id}`);
                  }}
                >
                  <circle
                    r={radius(n)}
                    fill={nodeFill(n)}
                    stroke="var(--canvas)"
                    strokeWidth={2}
                    opacity={hovered && hovered.id !== n.id ? 0.55 : 1}
                  />
                  <text
                    y={radius(n) + 13}
                    textAnchor="middle"
                    className="pointer-events-none"
                    style={{ font: "10.5px var(--font-geist-sans, sans-serif)", fill: "var(--slate)" }}
                  >
                    {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
                  </text>
                </g>
              ))}
            </svg>

            {hovered && (
              <div className="pointer-events-none absolute left-3 top-3 max-w-[320px] rounded-sm border border-hairline bg-canvas px-3.5 py-2.5 shadow-medium">
                <p className="font-serif text-[13.5px] font-semibold leading-[1.4]">{hovered.title}</p>
                <p className="mt-1 font-mono text-[11px] text-steel">
                  {[
                    hovered.year,
                    hovered.citationCount != null ? `被引 ${hovered.citationCount}` : null,
                    hovered.hasReview ? "已審查" : hovered.hasKeypoints ? "已分析" : "未分析",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
