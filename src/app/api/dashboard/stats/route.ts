import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/dashboard/stats";

export async function GET() {
  try {
    return NextResponse.json(getDashboardStats());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "統計查詢失敗" },
      { status: 500 }
    );
  }
}
