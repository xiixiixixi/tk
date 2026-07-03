import { NextResponse } from "next/server";
import {
  getNextPendingVideo,
  getVideoById,
  updateVideo,
  updateVideoStatus,
} from "@/lib/supabase/queries";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

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
 * 链式调用的"接力棒":fire-and-forget 触发下一轮 process。
 * 失败只记日志,不影响本轮返回(链断裂兜底)。
 */
async function triggerNext(): Promise<void> {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`, {
      cache: "no-store",
    });
  } catch (e) {
    console.error("chain error:", e);
  }
}

export async function GET() {
  const next = await getNextPendingVideo();
  if (!next) {
    return NextResponse.json({ processed: 0, message: "no pending tasks" });
  }

  const video = await getVideoById(next.id);
  if (!video) {
    return NextResponse.json({ processed: 0, message: "video not found" });
  }

  const oldStatus = video.analysis_status;
  const handler = HANDLERS[oldStatus];
  if (!handler) {
    return NextResponse.json({ processed: 0 });
  }

  try {
    const { nextStatus, extra } = await handler(video);
    await updateVideoStatus(video.id, nextStatus, extra);

    // 🟢 双重 DB 写入设计意图(handler 内部已 updateVideoStatus 一次,cron 这里再做一次;
    //   完全 idempotent,但保证 cron 端的权威性,handler 写漏了的 status 字段会被这里补齐)
    //
    // 🟡 紧循环防护(解决 Apify RUNNING 等中间态反复触发 process 的问题):
    //   如果 nextStatus === oldStatus(状态没推进,比如 Apify 还在跑),跳过 triggerNext。
    //   下次 cron 会再尝试 — 状态没变 = 一直等到外部推进状态。
    const stateAdvanced = nextStatus !== oldStatus;
    if (stateAdvanced) {
      await triggerNext();
    }

    // 🟢 同步关联 task.status 到终态(Phase 3 review 修复)
    // 之前只有失败路径会标 task.status,成功路径不标 → tasks.status 永远 'pending'
    // 现在:终态(completed / duplicate / failed)统一标 task 状态
    if (nextStatus === "completed" || nextStatus === "duplicate") {
      await syncTaskStatus(video.id, "completed", null);
      // 成功终态清空历史 error_message(重试成功的场景)
      if (video.error_message) {
        await updateVideo(video.id, { error_message: null });
      }
    }

    return NextResponse.json({
      processed: 1,
      video_id: video.id,
      old_status: oldStatus,
      new_status: nextStatus,
      chain_triggered: stateAdvanced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 失败原因同时记到 videos.error_message(详情页可见)和 tasks.error_message
    await updateVideoStatus(video.id, "failed", {
      error_message: message.slice(0, 500),
    });
    await failVideoTasks(video.id, message);
    // failed 是终态,不依赖 nextStatus,链也终止 → 不需要再 triggerNext
    return NextResponse.json({ processed: 1, video_id: video.id, error: message });
  }
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
