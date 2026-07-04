import { NextResponse } from "next/server";
import {
  getNextPendingVideo,
  getVideoById,
  updateVideo,
  updateVideoStatus,
} from "@/lib/supabase/queries";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { requireCronAuth } from "@/lib/auth/cron";
import { getAppConfigNumber } from "@/lib/app-config";
import { startScheduler } from "@/lib/scheduler";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

// 首次加载此模块时启动调度器(幂等,外部 cron service 每 5 分钟调用一次)
startScheduler();

// Pipeline handlers —— 由并行 agent 编写,部分模块可能尚未落盘。
// @ts-ignore handler 模块可能尚未存在
import fetchMetadata from "@/lib/pipeline/fetch-metadata";
// @ts-ignore handler 模块可能尚未存在
import pollApify from "@/lib/pipeline/poll-apify";
import uploadVideoToR2 from "@/lib/pipeline/upload-video-to-r2";
import extractSubtitle from "@/lib/pipeline/extract-subtitle";
// @ts-ignore handler 模块可能尚未存在
import analyzeWithGemini from "@/lib/pipeline/analyze-gemini";
// @ts-ignore handler 模块可能尚未存在(复用 fetchMetadata,把 status 重置回 'new')
import resetAndRestart from "@/lib/pipeline/reset-and-restart";

export const dynamic = "force-dynamic";

/** 卡死判定阈值:updated_at 超过该小时数未推进视为卡死 */
const STUCK_HOURS = 6;
/** 进入以下中间态的 video 若超时未推进,标 failed */
const STUCK_STATUSES = [
  "apify_started",
  "processing",
  "metadata_fetched",
  "subtitle_extracted",
];

type PipelineHandler = (
  video: VideoRow
) => Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }>;

// analysis_status → handler。缺省(completed/failed/duplicate/video_downloaded[deprecated]/analyzing)不在表内,直接跳过。
const HANDLERS: Partial<Record<string, PipelineHandler>> = {
  new: fetchMetadata,
  apify_started: pollApify,
  metadata_fetched: uploadVideoToR2,
  video_processed: extractSubtitle,
  audio_extracted: analyzeWithGemini,
  pending_analysis: resetAndRestart,
};

/**
 * 服务端内部调 cron 时带的 secret header(放行规则 1)
 */
function cronSecretHeader(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { "x-cron-secret": secret } : {};
}

/**
 * 扫描卡在中间态超过 STUCK_HOURS 的视频,标 failed。
 * DB 出错不外抛 — 这是兜底,不能影响主流程。
 */
async function sweepStuckVideos(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("videos")
      .update({ analysis_status: "failed", error_message: "超时未推进" })
      .in("analysis_status", STUCK_STATUSES)
      .lt("updated_at", cutoff)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("sweepStuckVideos error:", error);
      return 0;
    }
    const count = data?.length ?? 0;
    if (count > 0) console.log(`sweepStuckVideos: marked ${count} videos as failed`);
    return count;
  } catch (e) {
    console.error("sweepStuckVideos unexpected error:", e);
    return 0;
  }
}

/**
 * 链式调用的"接力棒":fire-and-forget 触发下一轮 process。
 * 失败只记日志,不影响本轮返回(链断裂兜底)。
 */
async function triggerNext(): Promise<void> {
  try {
    const port = process.env.PORT || "3000";
    await fetch(`http://localhost:${port}/api/cron/process`, {
      cache: "no-store",
      headers: cronSecretHeader(),
    });
  } catch (e) {
    console.error("chain error:", e);
  }
}

/**
 * 并发处理池:最多 concurrency 个 Promise 同时跑,出错不中断其他。
 */
async function poolAll<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        await fn(item);
        ok++;
      } catch {
        fail++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return { ok, fail };
}

export async function GET(req: Request) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  // 兜底:扫描卡在中间态超过 STUCK_HOURS 的视频
  await sweepStuckVideos();

  // ---- 从 DB 读并发配置(不存在时回退默认) ----
  let batchSize = 3;
  let concurrency = 2;
  try {
    batchSize = await getAppConfigNumber("pipeline_batch_size", 3);
    concurrency = await getAppConfigNumber("pipeline_concurrency", 2);
  } catch (e) {
    console.warn("[process] 读并发配置失败,用默认值", e);
  }

  // ---- 批量取待处理视频(FOR UPDATE SKIP LOCKED 保证不重复) ----
  // 注意:各次 RPC 调用是独立事务,锁在调用结束后释放。并发 grab 可能拿到同一条。
  // 用 seenIds 做本请求内去重,避免重复处理。
  const videos: VideoRow[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < batchSize; i++) {
    const next = await getNextPendingVideo();
    if (!next) break;
    if (seenIds.has(next.id)) continue;
    seenIds.add(next.id);
    const video = await getVideoById(next.id);
    if (video) videos.push(video);
  }

  if (videos.length === 0) {
    return NextResponse.json({ processed: 0, message: "no pending tasks" });
  }

  // ---- 并发处理:每个视频走自己的 handler,互不影响 ----
  const results: Array<{
    video_id: string;
    old_status: string;
    result: string;
    error?: string;
  }> = [];

  const { ok, fail } = await poolAll(videos, concurrency, async (video) => {
    const oldStatus = video.analysis_status;
    const handler = HANDLERS[oldStatus];
    if (!handler) {
      results.push({
        video_id: video.id,
        old_status: oldStatus,
        result: "no_handler",
      });
      return;
    }

    try {
      const { nextStatus, extra } = await handler(video);
      await updateVideoStatus(video.id, nextStatus, extra);

      // 终态同步 task
      if (nextStatus === "completed" || nextStatus === "duplicate") {
        await syncTaskStatus(video.id, "completed", null);
        if (video.error_message) {
          await updateVideo(video.id, { error_message: null });
        }
      }

      results.push({
        video_id: video.id,
        old_status: oldStatus,
        result: nextStatus,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateVideoStatus(video.id, "failed", {
        error_message: message.slice(0, 500),
      });
      await failVideoTasks(video.id, message);
      results.push({
        video_id: video.id,
        old_status: oldStatus,
        result: "failed",
        error: message,
      });
      throw err; // poolAll 计数
    }
  });

  // ---- 链式接力:有视频推进了就触发下一轮 ----
  const anyAdvanced = results.some((r) => r.result !== r.old_status);
  if (anyAdvanced) {
    await triggerNext();
  }

  return NextResponse.json({
    processed: ok,
    failed: fail,
    batch_size: videos.length,
    concurrency,
    results,
  });
}

/** 把该视频关联的未终结任务标记为 failed。DB 出错不外抛,避免掩盖原始错误。 */
async function failVideoTasks(videoId: string, errorMessage: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("tasks")
      .update({ status: "failed", error_message: errorMessage })
      .eq("related_video_id", videoId)
      .neq("status", "failed");
  } catch (e) {
    console.error("updateTask(failed) error:", e);
  }
}

/**
 * 同步关联 task 状态(成功路径用)
 * - 终态成功(completed / duplicate)→ status='completed',current_step=null
 * - DB 出错不外抛,避免掩盖原始错误
 */
async function syncTaskStatus(
  videoId: string,
  status: "completed" | "failed",
  currentStep: string | null
): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("tasks")
      .update({
        status,
        current_step: currentStep,
        ...(status === "failed" ? {} : { error_message: null }), // 成功清掉历史 error
      })
      .eq("related_video_id", videoId)
      // 已有任务失败不覆盖(因为失败的 error_message 更重要)
      .in("status", ["pending", "processing"]);
  } catch (e) {
    console.error("syncTaskStatus error:", e);
  }
}
