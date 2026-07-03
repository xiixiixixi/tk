import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

/**
 * 刷新已完成视频的最新互动指标(播放/点赞/评论/分享)
 *
 * 状态:
 * - 当前 stub:不论 mock 还是真实模式,都返 processed=0
 * - Phase 5+:实现真实 Apify metrics refresh(需要 Apify support 增量 metrics API)
 *
 * 现在这个端点主要用来标记视频"已抓过"(last_fetch_time 风格),后续接真实 SDK
 */
export async function GET() {
  const isMock = process.env.MOCK_APIFY === "true";

  const { count, error } = await getSupabaseAdmin()
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("analysis_status", "completed");

  if (error) {
    return NextResponse.json({ processed: 0, error: error.message }, { status: 200 });
  }

  return NextResponse.json({
    processed: 0,
    completed_videos: count ?? 0,
    reason: isMock
      ? "mock 模式也未实现(目前主要用于 Phase 4 接入预演);Phase 5+ 接 Apify metrics refresh SDK"
      : "真实 Apify metrics refresh 待 Phase 5+",
  });
}