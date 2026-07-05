/** Chat 訊息的附加資料（存 chat_messages.meta_json）：命令結果連結卡與注入脈絡摘要。 */

export interface ChatInjectedPaper {
  paperId: string;
  title: string;
  chars: number;
  truncated: boolean;
}

export type ChatMessageMeta =
  | { kind: "review"; paperId: string }
  | { kind: "compare"; compareId: string }
  | { kind: "debate"; debateId: string; motion: string }
  | { kind: "error" };
