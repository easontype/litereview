export interface RankInfo {
  sjrQuartile: string | null;
  coreRank: string | null;
}

const SJR_TONE: Record<string, string> = {
  Q1: "bg-success/10 text-success",
  Q2: "bg-primary/10 text-primary",
  Q3: "bg-black/[0.06] text-slate",
  Q4: "bg-black/[0.06] text-steel",
};

const CORE_TONE: Record<string, string> = {
  "A*": "bg-success/10 text-success",
  A: "bg-success/10 text-success",
  B: "bg-primary/10 text-primary",
  C: "bg-black/[0.06] text-slate",
};

/** 期刊 SJR quartile / 會議 CORE 分級徽章（資料未匯入或查無比對時不渲染）。 */
export function RankBadge({ rank }: { rank: RankInfo | null | undefined }) {
  if (!rank || (!rank.sjrQuartile && !rank.coreRank)) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {rank.sjrQuartile && (
        <span
          title="Scimago SJR 期刊分級"
          className={`inline-flex items-center rounded-xs px-1.5 py-px font-mono text-[10.5px] font-semibold ${SJR_TONE[rank.sjrQuartile] ?? "bg-black/[0.06] text-slate"}`}
        >
          {rank.sjrQuartile}
        </span>
      )}
      {rank.coreRank && (
        <span
          title="CORE 會議分級"
          className={`inline-flex items-center rounded-xs px-1.5 py-px font-mono text-[10.5px] font-semibold ${CORE_TONE[rank.coreRank] ?? "bg-black/[0.06] text-slate"}`}
        >
          CORE {rank.coreRank}
        </span>
      )}
    </span>
  );
}
