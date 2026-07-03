import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

/**
 * Pipeline Step "重置":把 pending_analysis 状态的 video 拉回 'new',
 * 让下一轮 cron 调度重新走 fetchMetadata(复用 fetchMetadata.ts 的逻辑)。
 *
 * 触发场景:Gemini 调用失败/超时被标为 pending_analysis,等人工/调度重跑。
 */
export default async function resetAndRestart(
  _video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  return { nextStatus: "new" };
}
