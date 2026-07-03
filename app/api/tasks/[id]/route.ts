import {
  getLatestAnalysis,
  getTaskById,
  getVideoById,
} from "@/lib/supabase/queries";
import type { AnalysisResultRow, TaskRow, VideoDetail } from "@/lib/pipeline/types";

/**
 * GET /api/tasks/:id
 * 查询单个任务及其关联资源(视频 + 最新分析结果)。
 *
 * 响应:
 *   200 { task: TaskRow, video: VideoDetail | null, latest_analysis: AnalysisResultRow | null }
 *   404 { error: "任务不存在" }
 *
 * 错误: catch → 500
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const task: TaskRow | null = await getTaskById(id);
    if (!task) {
      return Response.json({ error: "任务不存在" }, { status: 404 });
    }

    let video: VideoDetail | null = null;
    let latestAnalysis: AnalysisResultRow | null = null;

    if (task.related_video_id) {
      video = await getVideoById(task.related_video_id);
      if (video) {
        latestAnalysis = await getLatestAnalysis(video.id);
      }
    }

    return Response.json(
      { task, video, latest_analysis: latestAnalysis },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `查询任务失败: ${message}` }, { status: 500 });
  }
}
