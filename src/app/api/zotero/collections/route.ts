import { NextResponse } from "next/server";
import { listCollections } from "@/lib/zotero/local-api";

export async function GET() {
  try {
    return NextResponse.json({ collections: await listCollections() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "讀取 Zotero collections 失敗" },
      { status: 502 }
    );
  }
}
