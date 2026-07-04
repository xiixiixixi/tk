import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { getVideoById, updateVideo } from "@/lib/supabase/queries";

/**
 * POST /api/videos/:id/reanalyze
 * 重置该视频的 analysis_status 为 'new',让它重新走解析 pipeline。
 *
 * 不创建新记录、不重复下载——复用原 video 记录 + 原 R2 视频文件(如果有)。
 * 适用场景:解析失败后点「重新分析」,或想用新模型重新跑一遍。
 *
 * 行为:
 *   1. 清空 error_message
 *   2. analysis_status → 'new'(调度器下一轮会取到它)
 *   3. fire-and-forget 触发 /api/cron/process(立即推进,不等定时器)
 *
 * 200 → { video_id, status: 'new', message }
 * 404 → 视频不存在
 * 500 → 更新失败
 */
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const video = await getVideoById(id);
    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    // 重置状态:清错误 + 回到 new
    await updateVideo(id, {
      analysis_status: "new",
      error_message: null,
    });

    // 立即触发 pipeline(不阻塞响应)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.CRON_SECRET;
    if (appUrl) {
      void fetch(`${appUrl}/api/cron/process`, {
        headers: secret ? { "x-cron-secret": secret } : {},
      }).catch(() => {});
    }

    return NextResponse.json({
      video_id: id,
      status: "new",
      message: "已重新提交解析",
    });
  } catch (err) {
    console.error("[POST /api/videos/:id/reanalyze] 失败", err);
    return NextResponse.json({ error: "重新解析失败" }, { status: 500 });
  }
}
