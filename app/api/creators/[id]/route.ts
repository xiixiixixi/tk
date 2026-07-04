import { getSupabaseAdmin } from "@/lib/supabase/client";
import {
  cascadeDeleteCreatorVideos,
  deleteCreator,
  getCreatorById,
  getCreatorVideoStats,
  updateCreator,
} from "@/lib/supabase/queries";
import type { CreatorRow } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/creators/:id
 * 切换博主订阅状态(仅允许 'active' / 'paused')。
 *
 * 请求体: { status: 'active' | 'paused' }
 *
 * 200 → { id, status }
 * 400 → id 不是 UUID / status 非法 / 请求体无法解析
 * 404 → creator 不存在
 * 500 → 查询或更新失败
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/creators/:id
 * 返回该博主的详情 + 视频统计(总数 / 已分析数),
 * 供前端删除确认弹窗展示"将一并删除 N 条视频"使用。
 *
 * 200 → CreatorWithStats(creators 行字段 + video_count + analyzed_count)
 * 400 → id 不是 UUID
 * 404 → creator 不存在
 * 500 → 查询失败
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  let creator: CreatorRow | null;
  try {
    creator = await getCreatorById(id);
  } catch (err) {
    console.error("[GET /api/creators/:id] 查询失败", err);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }

  if (!creator) {
    return Response.json({ error: "creator 不存在" }, { status: 404 });
  }

  try {
    const stats = await getCreatorVideoStats(creator.creator_id);
    return Response.json({ ...creator, ...stats }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/creators/:id] 统计失败", err);
    return Response.json({ error: "统计失败" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  let status: unknown;
  try {
    const body = (await request.json()) as { status?: unknown };
    status = body.status;
  } catch (err) {
    console.error("[PATCH /api/creators/:id] 解析请求体失败", err);
    return Response.json({ error: "请求体无法解析为 JSON" }, { status: 400 });
  }
  if (status !== "active" && status !== "paused") {
    return Response.json(
      { error: "status 必须是 'active' 或 'paused'" },
      { status: 400 }
    );
  }

  // 先查再改:update 在无匹配行时不会抛错,用一次 select 区分 404 与 200。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("creators")
    .select("id")
    .eq("id", id)
    .maybeSingle<Pick<CreatorRow, "id">>();

  if (selectErr) {
    console.error("[PATCH /api/creators/:id] 查询失败", selectErr);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "creator 不存在" }, { status: 404 });
  }

  try {
    await updateCreator(id, { status });
    return Response.json({ id, status }, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/creators/:id] 更新失败", err);
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}

/**
 * DELETE /api/creators/:id
 * 从监控列表中移除一个博主。
 *
 * 副作用:会调用 cascadeDeleteCreatorVideos 把该博主 creator_url
 * 采到的所有未删除视频一并软删除(deleted_at = NOW())。返回值中
 * deleted_videos_count 让前端确认弹窗展示"将一并删除 N 条视频"。
 *
 * 校验:id 必须是 UUID v4 形式(PostgreSQL gen_random_uuid() 输出)
 *
 * 200 → { id, deleted_videos_count: number }
 * 400 → id 不是 UUID
 * 404 → 记录不存在
 * 500 → 查询 / 级联软删 / 删除博主失败
 */

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  // 先查再删:Supabase delete 在"无匹配行"时不会抛错,只返 data=null,
  // 所以用一次 select 区分 404 和 200。同时需要 creator_url 给 cascade。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("creators")
    .select("id, creator_url")
    .eq("id", id)
    .maybeSingle<Pick<CreatorRow, "id" | "creator_url">>();

  if (selectErr) {
    console.error("[DELETE /api/creators/:id] 查询失败", selectErr);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "creator 不存在" }, { status: 404 });
  }

  try {
    const deletedVideosCount = await cascadeDeleteCreatorVideos(existing.creator_url);
    await deleteCreator(id);
    return Response.json({ id, deleted_videos_count: deletedVideosCount }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/creators/:id] 删除失败", err);
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
