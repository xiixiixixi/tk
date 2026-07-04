import { shouldUseApifyMock, startActorRun } from "@/lib/apify/client";
import { mockApifyVideo } from "@/lib/apify/mock";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";
import { updateVideo, updateVideoStatus } from "@/lib/supabase/queries";
import type { AnalysisStatus } from "@/types";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";

/**
 * Pipeline Step 1a:启动 Apify Actor
 *
 * 输入:video (analysis_status = 'new')
 * 单步耗时:~1s
 *
 * - Mock 路径:直接 generate mockApifyVideo,写入元数据 → metadata_fetched(跳过 apify_started)
 * - 真实路径:启动 Apify → 拿到 runId → 写 runId + status='apify_started'
 *
 * 错误直接 throw,外层调度器会把 status 改为 failed
 */
export default async function fetchMetadata(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  // 已通过关键词/博主采集拿到元数据的视频,跳过 Apify,直接进入下一步
  if (video.tiktok_video_id) {
    return { nextStatus: "metadata_fetched" };
  }

  const url = video.original_url ?? "";

  if (shouldUseApifyMock()) {
    const mock = mockApifyVideo(url);
    await updateVideoStatus(video.id, "metadata_fetched", apifyResultToVideoUpdate(mock));
    return { nextStatus: "metadata_fetched" };
  }

  const runId = await startActorRun(url);
  await updateVideo(video.id, {
    apify_run_id: runId,
    apify_started_at: new Date().toISOString(),
    analysis_status: "apify_started",
  });
  return { nextStatus: "apify_started" };
}