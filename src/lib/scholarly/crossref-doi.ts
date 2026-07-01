import type { PaperResult } from "./types";
import { fetchOpenAlexByDoi } from "./openalex";

/** DOI regex 命中時的查詢入口（SPEC.md：走 OpenAlex DOI lookup，非直接呼叫 Crossref）。 */
export async function fetchByDoi(doi: string): Promise<PaperResult | null> {
  return fetchOpenAlexByDoi(doi);
}
