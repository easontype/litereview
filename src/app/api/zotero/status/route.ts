import { NextResponse } from "next/server";
import { zoteroRunning } from "@/lib/zotero/local-api";

export async function GET() {
  return NextResponse.json({ running: await zoteroRunning() });
}
