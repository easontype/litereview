export interface SourceQuality {
  twoYearCitedness: number | null;
  hIndex: number | null;
}

function contactParam(): string {
  const email = process.env.CONTACT_EMAIL;
  return email ? `&mailto=${encodeURIComponent(email)}` : "";
}

/** 查 OpenAlex Source API 取得期刊/會議的品質信號（非正式分級，僅供參考）。 */
export async function getSourceQuality(sourceId: string): Promise<SourceQuality | null> {
  const shortId = sourceId.split("/").pop();
  const res = await fetch(`https://api.openalex.org/sources/${shortId}${contactParam() ? "?" + contactParam().slice(1) : ""}`);
  if (!res.ok) return null;

  const source = await res.json();
  const stats = source.summary_stats ?? {};
  return {
    twoYearCitedness: stats["2yr_mean_citedness"] ?? source["2yr_mean_citedness"] ?? null,
    hIndex: stats.h_index ?? source.h_index ?? null,
  };
}

/** 批次查詢多個 source 的品質信號，單一 source 失敗不影響其他筆。 */
export async function getSourceQualityBatch(
  sourceIds: string[]
): Promise<Map<string, SourceQuality>> {
  const uniqueIds = [...new Set(sourceIds)];
  const results = await Promise.allSettled(
    uniqueIds.map(async (id) => [id, await getSourceQuality(id)] as const)
  );

  const map = new Map<string, SourceQuality>();
  for (const result of results) {
    if (result.status === "fulfilled" && result.value[1]) {
      map.set(result.value[0], result.value[1]);
    }
  }
  return map;
}
