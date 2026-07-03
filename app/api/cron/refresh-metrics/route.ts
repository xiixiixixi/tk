import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/client";
import {
  getRunDataset,
  getRunStatus,
  startActorRun,
  shouldUseApifyMock,
} from "@/lib/apify/client";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";
import type { ApifyTikTokResult } from "@/types";

export const dynamic = "force-dynamic";

/**
 * 刷新已完成视频的最新互动指标(播放/点赞/评论/分享/收藏)
 *
 * - Mock 模式:直接返 stub(不真刷新)
 * - 真实模式:遍历 completed 视频 → startActorRun(postURLs)→ 取最新 counts → update
 *   (只更新互动数字,不重新跑分析,省钱)
 *
 * ⚠️ 成本控制:每次只刷新最近 N 条(避免一次性跑爆 Apify 额度)
 */
const MAX_REFRESH_PER_RUN = 5;

export async function GET() {
  const isMock = shouldUseApifyMock();

  // 取最近 N 条 completed 视频(有 canonical_url 才能重抓)
  const { data: videos, error } = await getSupabaseAdmin()
    .from("videos")
    .select("id, canonical_url, tiktok_video_id")
    .eq("analysis_status", "completed")
    .not("canonical_url", "is", null)
    .order("last_metric_update_time", { ascending: true, nullsFirst: true })
    .limit(MAX_REFRESH_PER_RUN);

  if (error) {
    return NextResponse.json({ processed: 0, error: error.message }, { status: 200 });
  }

  if (isMock) {
    return NextResponse.json({
      processed: 0,
      completed_videos: videos?.length ?? 0,
      mode: "mock",
      reason: "Mock 模式不刷新真实指标",
    });
  }

  if (!videos || videos.length === 0) {
    return NextResponse.json({ processed: 0, completed_videos: 0, mode: "real" });
  }

  let refreshed = 0;
  const errors: string[] = [];

  for (const video of videos) {
    try {
      const url = video.canonical_url;
      if (!url) continue;

      const runId = await startActorRun(url);
      // 单视频轮询
      let succeeded = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await getRunStatus(runId);
        if (status === "SUCCEEDED") {
          succeeded = true;
          break;
        }
        if (status === "FAILED" || status === "ABORTED") break;
      }
      if (!succeeded) {
        errors.push(`video ${video.id}: run ${runId} 未成功`);
        continue;
      }

      const dataset = await getRunDataset(runId);
      const data: ApifyTikTokResult | undefined = dataset.find(
        (d) => !d.error && d.id === video.tiktok_video_id
      ) ?? dataset.find((d) => !d.error);

      if (data) {
        // 只更新互动指标(不碰分析结果)
        const metrics = apifyResultToVideoUpdate(data);
        await getSupabaseAdmin()
          .from("videos")
          .update({
            play_count: metrics.play_count,
            like_count: metrics.like_count,
            comment_count: metrics.comment_count,
            share_count: metrics.share_count,
            collect_count: metrics.collect_count,
            last_metric_update_time: new Date().toISOString(),
          })
          .eq("id", video.id);
        refreshed++;
      }
    } catch (err) {
      errors.push(
        `video ${video.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json({
    processed: refreshed,
    completed_videos: videos.length,
    mode: "real",
    errors: errors.length > 0 ? errors : undefined,
  });
}
