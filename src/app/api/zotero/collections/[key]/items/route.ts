import { NextRequest, NextResponse } from "next/server";
import { listCollectionItems } from "@/lib/zotero/local-api";
import { isInWorkspace, paperIdFor } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  try {
    const items = await listCollectionItems(key);
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        inWorkspace:
          Boolean(item.title || item.doi || item.arxivId) &&
          isInWorkspace(paperIdFor(item)),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "讀取 Zotero 條目失敗" },
      { status: 502 }
    );
  }
}
