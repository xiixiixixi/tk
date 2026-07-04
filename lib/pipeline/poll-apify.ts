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
 * Apify run 进入 apify_started 状态超过该小时数,视为卡死,标 failed
 */
const POLL_TIMEOUT_HOURS = 2;

/**
 * Pipeline Step 1b:轮询 Apify 结果 + 去重
 *
 * 输入:video (analysis_status = 'apify_started')
 * 单步耗时:~3s
 *
 * - apify_started_at 超 POLL_TIMEOUT_HOURS → 标 failed
 * - RUNNING / TIMED-OUT → 写/更新 apify_started_at → 不动 status,下次链再查
 * - SUCCEEDED → 拉 dataset → 按 tiktok_video_id 查重:
 *     - 已存在 → 当前 video 标 duplicate;可选把关联 task 改到已有 video
 *     - 不存在 → 写入元数据 + status='metadata_fetched'
 *     - dataset 为空 → 标 failed(不 throw,避免上层堆栈)
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

  // 超时检测:apify_started_at 超过 POLL_TIMEOUT_HOURS 仍未推进,标 failed
  if (video.apify_started_at) {
    const startedAt = new Date(video.apify_started_at).getTime();
    const elapsedHours = (Date.now() - startedAt) / (1000 * 60 * 60);
    if (elapsedHours > POLL_TIMEOUT_HOURS) {
      await updateVideoStatus(video.id, "failed", {
        error_message: "Apify run 超时未返回",
      });
      return { nextStatus: "failed" };
    }
  }

  const status = await getRunStatus(runId);

  if (status === "RUNNING" || status === "TIMED-OUT") {
    // 首次进入 RUNNING 时补写 apify_started_at,后续每轮刷新,用于超时判断
    await updateVideo(video.id, { apify_started_at: new Date().toISOString() });
    return { nextStatus: "apify_started" };
  }
  if (status === "FAILED" || status === "ABORTED") {
    throw new Error(`Apify run ${runId} ${status}`);
  }

  // SUCCEEDED
  const dataset = await getRunDataset(runId);
  const data = dataset[0];
  if (!data) {
    await updateVideoStatus(video.id, "failed", {
      error_message: `Apify run ${runId} dataset 为空`,
    });
    return { nextStatus: "failed" };
  }

  const existing = await getVideoByTiktokId(data.id);

  // existing 可能是它自己(关键词/博主采集入库时已带 tiktok_video_id)
  if (existing && existing.id !== video.id) {
    await updateVideoStatus(video.id, "duplicate");
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