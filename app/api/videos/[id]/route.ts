import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { deleteVideo, getLatestAnalysis, getVideoById } from "@/lib/supabase/queries";
import type { VideoDetail, AnalysisResultRow } from "@/lib/pipeline/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * DELETE /api/videos/:id
 * 软删除单条视频(00007)。仅允许手动提交的 manual_video:
 * 博主/关键词采集的视频应当通过删除源来级联清理,而非逐条删除。
 *
 * 200 → { id, deleted: true }
 * 400 → id 不是 UUID
 * 403 → source_type 不是 'manual_video'
 * 404 → video 不存在
 * 409 → 已软删除(幂等防护)
 * 500 → 查询或软删除失败
 */

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  // 一次 select 把"不存在 / 已软删 / 来源类型"全部区分出来。
  // 这里不调 getVideoById:它内部 is("deleted_at", null) 会把 409 合并进 404。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("videos")
    .select("id, source_type, deleted_at")
    .eq("id", id)
    .maybeSingle<{ id: string; source_type: string; deleted_at: string | null }>();

  if (selectErr) {
    console.error("[DELETE /api/videos/:id] 查询失败", selectErr);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "video 不存在" }, { status: 404 });
  }
  if (existing.deleted_at !== null) {
    return NextResponse.json({ error: "video 已被删除" }, { status: 409 });
  }
  if (existing.source_type !== "manual_video") {
    return NextResponse.json(
      { error: "仅允许删除手动提交的视频(manual_video);博主/关键词采集的视频请通过删除源来清理" },
      { status: 403 }
    );
  }

  try {
    await deleteVideo(id);
    return NextResponse.json({ id, deleted: true }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/videos/:id] 软删除失败", err);
    return NextResponse.json({ error: "软删除失败" }, { status: 500 });
  }
}
