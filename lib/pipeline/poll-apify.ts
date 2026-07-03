import { getRunDataset, getRunStatus } from "@/lib/apify/client";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import {
  getVideoByTiktokId,
  updateVideo,
  updateVideoStatus,
} from "@/lib/supabase/queries";
import type { AnalysisStatus } from "@/types";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";

/**
 * Pipeline Step 1b:轮询 Apify 结果 + 去重
 *
 * 输入:video (analysis_status = 'apify_started')
 * 单步耗时:~3s
 *
 * - RUNNING / TIMED-OUT → 不动 status,下次链再查
 * - SUCCEEDED → 拉 dataset → 按 tiktok_video_id 查重:
 *     - 已存在 → 当前 video 标 duplicate;可选把关联 task 改到已有 video
 *     - 不存在 → 写入元数据 + status='metadata_fetched'
 * - FAILED / ABORTED → throw(上层会标 failed)
 *
 * Mock 路径已由 fetch-metadata 直接跳到 metadata_fetched,本 handler 不处理 mock
 *
 * 🟡 紧循环防护:本 handler 在 Apify RUNNING 时返 nextStatus='apify_started'(同上),
 *   调度器会感知"状态没变"从而不再 triggerNext(见 app/api/cron/process/route.ts)
 */
export default async function pollApify(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  const runId = video.apify_run_id;
  if (!runId) {
    throw new Error(`pollApify: video ${video.id} 缺少 apify_run_id`);
  }

  const status = await getRunStatus(runId);

  if (status === "RUNNING" || status === "TIMED-OUT") {
    return { nextStatus: "apify_started" };
  }
  if (status === "FAILED" || status === "ABORTED") {
    throw new Error(`Apify run ${runId} ${status}`);
  }

  // SUCCEEDED
  const dataset = await getRunDataset(runId);
  const data = dataset[0];
  if (!data) {
    throw new Error(`Apify run ${runId} dataset 为空`);
  }

  const existing = await getVideoByTiktokId(data.id);

  if (existing) {
    await updateVideoStatus(video.id, "duplicate");
    // (可选)把关联 task 的 related_video_id 改到已存在的 video,前端可直接跳详情
    await getSupabaseAdmin()
      .from("tasks")
      .update({ related_video_id: existing.id })
      .eq("related_video_id", video.id);
    return { nextStatus: "duplicate" };
  }

  await updateVideo(video.id, {
    analysis_status: "metadata_fetched",
    ...apifyResultToVideoUpdate(data),
  });
  return { nextStatus: "metadata_fetched" };
}