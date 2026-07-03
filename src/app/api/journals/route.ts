import { NextRequest, NextResponse } from "next/server";
import { getRank, rankingsAvailable, searchJournalRanks } from "@/lib/rankings/lookup";

interface OpenAlexSource {
  display_name?: string;
  issn_l?: string | null;
  type?: string;
  works_count?: number;
  host_organization_name?: string | null;
  summary_stats?: { "2yr_mean_citedness"?: number; h_index?: number };
}

export interface JournalHit {
  name: string;
  issn: string | null;
  type: string;
  publisher: string | null;
  worksCount: number | null;
  hIndex: number | null;
  twoYearCitedness: number | null;
  rank: { sjrQuartile: string | null; coreRank: string | null } | null;
}

/** 期刊/會議查詢：OpenAlex sources 搜尋掛上本地 SJR/CORE 分級；OpenAlex 失敗時退回純本地資料。 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q 為必填" }, { status: 400 });

  const email = process.env.CONTACT_EMAIL;
  const mailto = email ? `&mailto=${encodeURIComponent(email)}` : "";

  try {
    const res = await fetch(
      `https://api.openalex.org/sources?search=${encodeURIComponent(q)}&per_page=10${mailto}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    const json = (await res.json()) as { results?: OpenAlexSource[] };

    const hits: JournalHit[] = (json.results ?? []).map((s) => ({
      name: s.display_name ?? "",
      issn: s.issn_l ?? null,
      type: s.type ?? "journal",
      publisher: s.host_organization_name ?? null,
      worksCount: s.works_count ?? null,
      hIndex: s.summary_stats?.h_index ?? null,
      twoYearCitedness: s.summary_stats?.["2yr_mean_citedness"] ?? null,
      rank: getRank(s.issn_l, s.display_name),
    }));
    return NextResponse.json({ hits, rankingsLoaded: rankingsAvailable(), source: "openalex" });
  } catch {
    const hits: JournalHit[] = searchJournalRanks(q).map((r) => ({
      name: r.title,
      issn: r.issn,
      type: r.kind,
      publisher: null,
      worksCount: null,
      hIndex: null,
      twoYearCitedness: null,
      rank: { sjrQuartile: r.sjrQuartile, coreRank: r.coreRank },
    }));
    return NextResponse.json({ hits, rankingsLoaded: rankingsAvailable(), source: "local" });
  }
}
