import { getPaper } from "@/lib/db";
import { getFullTextCached } from "@/lib/fulltext/store";
import type { ChatInjectedPaper } from "./types";

export const MAX_CONTEXT_PAPERS = 3;
export const MAX_CHARS_PER_PAPER = 60_000;

export interface ChatContext {
  /** 空字串＝沒有選論文。 */
  contextText: string;
  injected: ChatInjectedPaper[];
}

/**
 * 組出對話的論文全文脈絡：每篇走 getFullTextCached（與找重點/審查同一份快取），
 * 至多 MAX_CONTEXT_PAPERS 篇、每篇截斷 MAX_CHARS_PER_PAPER 字；沒有全文的論文自然退回 abstract。
 */
export async function buildChatContext(paperIds: string[]): Promise<ChatContext> {
  const injected: ChatInjectedPaper[] = [];
  const sections: string[] = [];

  for (const paperId of paperIds.slice(0, MAX_CONTEXT_PAPERS)) {
    const paper = getPaper(paperId);
    if (!paper) continue;
    const fullText = await getFullTextCached(paperId, {
      arxivId: paper.arxivId,
      doi: paper.doi,
      pdfUrl: paper.pdfUrl,
      abstract: paper.abstract,
    });
    const truncated = fullText.text.length > MAX_CHARS_PER_PAPER;
    const text = truncated ? fullText.text.slice(0, MAX_CHARS_PER_PAPER) : fullText.text;
    injected.push({ paperId, title: paper.title, chars: text.length, truncated });
    sections.push(
      `### 論文 ${sections.length + 1}：${paper.title}${truncated ? "（全文過長，已截斷）" : ""}\n\n${text}`
    );
  }

  if (sections.length === 0) return { contextText: "", injected: [] };

  const contextText = [
    "你是一位文獻研究助理。以下是使用者提供的論文全文脈絡，回答問題時請優先依據這些內容，並在引用時指出所屬論文：",
    "",
    ...sections,
  ].join("\n");
  return { contextText, injected };
}
