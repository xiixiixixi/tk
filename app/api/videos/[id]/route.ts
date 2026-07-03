import { NextResponse, type NextRequest } from "next/server";
import { getVideoById, getLatestAnalysis } from "@/lib/supabase/queries";
import type { VideoDetail, AnalysisResultRow } from "@/lib/pipeline/types";

/**
 * GET /api/videos/:id
 *
 * 200 → { video: VideoDetail, latest_analysis: AnalysisResultRow | null }
 * 404 → video 不存在
 * 500 → 查询失败
 *
 * Next 15+/16 路由参数是 Promise,需要 await
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id 不能为空" }, { status: 400 });
  }

  let video: VideoDetail | null;
  try {
    video = await getVideoById(id);
  } catch (err) {
    console.error("[GET /api/videos/:id] getVideoById 失败", err);
    return NextResponse.json({ error: "查询视频失败" }, { status: 500 });
  }

  if (!video) {
    return NextResponse.json({ error: "video 不存在" }, { status: 404 });
  }

  try {
    const latestAnalysis: AnalysisResultRow | null = await getLatestAnalysis(video.id);
    return NextResponse.json(
      { video, latest_analysis: latestAnalysis },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/videos/:id] getLatestAnalysis 失败", err);
    return NextResponse.json({ error: "查询分析结果失败" }, { status: 500 });
  }
}
