import { getSupabaseAdmin } from "@/lib/supabase/client";
import {
  cascadeDeleteKeywordVideos,
  deleteKeyword,
  getKeywordById,
  getKeywordVideoStats,
  updateKeyword,
} from "@/lib/supabase/queries";
import type { KeywordRow, KeywordUpdate } from "@/lib/pipeline/types";

/**
 * DELETE /api/keywords/:id
 * 从监控列表中移除一个关键词。
 *
 * 副作用:会调用 cascadeDeleteKeywordVideos 把该 keyword
 * 采到的所有未删除视频一并软删除(deleted_at = NOW())。返回值中
 * deleted_videos_count 让前端确认弹窗展示"将一并删除 N 条视频"。
 *
 * 校验:id 必须是 UUID v4 形式(PostgreSQL gen_random_uuid() 输出)
 *
 * 200 → { id, deleted_videos_count: number }
 * 400 → id 不是 UUID
 * 404 → 记录不存在
 * 500 → 查询 / 级联软删 / 删除关键词失败
 *
 * PATCH /api/keywords/:id
 * 编辑一个关键词的字段(状态切换 / 筛选条件)。
 *
 * 请求体(所有字段可选,但至少要传一个):
 *   {
 *     status?: 'active' | 'paused',
 *     min_play_count?: number,           // 整数,>= 0
 *     min_like_count?: number,           // 整数,>= 0
 *     min_engagement_rate?: number,      // 0-1 之间的小数
 *     published_after?: string,          // ISO 时间字符串
 *     min_duration_sec?: number,         // 整数,>= 0
 *     max_duration_sec?: number,         // 整数,>= 0
 *     unwanted_hashtags?: string[],      // 字符串数组
 *     exclude_slideshow?: boolean,
 *   }
 *
 * 200 → { ok: true }
 * 400 → id 不是 UUID / 请求体为空或字段全部非法 / 字段值越界
 * 404 → 记录不存在
 * 500 → 更新失败
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NON_NEGATIVE_INT_FIELDS = [
  "min_play_count",
  "min_like_count",
  "min_duration_sec",
  "max_duration_sec",
] as const;

/**
 * GET /api/keywords/:id
 * 返回该关键词详情 + 视频统计(总数 / 已分析数),
 * 供前端删除确认弹窗展示"将一并删除 N 条视频"使用。
 *
 * 200 → KeywordWithStats(keywords 行字段 + video_count + analyzed_count)
 * 400 → id 不是 UUID
 * 404 → keyword 不存在
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

  let keyword: KeywordRow | null;
  try {
    keyword = await getKeywordById(id);
  } catch (err) {
    console.error("[GET /api/keywords/:id] 查询失败", err);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }

  if (!keyword) {
    return Response.json({ error: "keyword 不存在" }, { status: 404 });
  }

  try {
    const stats = await getKeywordVideoStats(keyword.keyword);
    return Response.json({ ...keyword, ...stats }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/keywords/:id] 统计失败", err);
    return Response.json({ error: "统计失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  // 先查再删:Supabase delete 在"无匹配行"时不会抛错,只返 data=null,
  // 所以用一次 select 区分 404 和 200。同时需要 keyword 文本给 cascade。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("keywords")
    .select("id, keyword")
    .eq("id", id)
    .maybeSingle<Pick<KeywordRow, "id" | "keyword">>();

  if (selectErr) {
    console.error("[DELETE /api/keywords/:id] 查询失败", selectErr);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "keyword 不存在" }, { status: 404 });
  }

  try {
    const deletedVideosCount = await cascadeDeleteKeywordVideos(existing.keyword);
    await deleteKeyword(id);
    return Response.json({ id, deleted_videos_count: deletedVideosCount }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/keywords/:id] 删除失败", err);
    return Response.json({ error: "删除失败" }, { status: 500 });
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
  }

  // 逐字段校验,挑出能进 patch 的字段。
  const patch: KeywordUpdate = {};

  if (body.status !== undefined && body.status !== null) {
    if (body.status !== "active" && body.status !== "paused") {
      return Response.json(
        { error: "status 必须是 'active' 或 'paused'" },
        { status: 400 }
      );
    }
    patch.status = body.status;
  }

  for (const field of NON_NEGATIVE_INT_FIELDS) {
    if (body[field] === undefined || body[field] === null) continue;
    const n = Number(body[field]);
    if (!Number.isInteger(n) || n < 0) {
      return Response.json(
        { error: `${field} 必须是 >= 0 的整数` },
        { status: 400 }
      );
    }
    patch[field] = n;
  }

  if (body.min_engagement_rate !== undefined && body.min_engagement_rate !== null) {
    const n = Number(body.min_engagement_rate);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return Response.json(
        { error: "min_engagement_rate 必须在 0-1 之间" },
        { status: 400 }
      );
    }
    patch.min_engagement_rate = n;
  }

  if (body.published_after !== undefined && body.published_after !== null) {
    const s = String(body.published_after);
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
      return Response.json(
        { error: "published_after 必须是合法的 ISO 时间字符串" },
        { status: 400 }
      );
    }
    patch.published_after = new Date(ms).toISOString();
  }

  if (body.unwanted_hashtags !== undefined && body.unwanted_hashtags !== null) {
    if (
      !Array.isArray(body.unwanted_hashtags) ||
      !body.unwanted_hashtags.every((x) => typeof x === "string")
    ) {
      return Response.json(
        { error: "unwanted_hashtags 必须是字符串数组" },
        { status: 400 }
      );
    }
    const cleaned = body.unwanted_hashtags
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);
    patch.unwanted_hashtags = cleaned;
  }

  if (body.exclude_slideshow !== undefined && body.exclude_slideshow !== null) {
    if (typeof body.exclude_slideshow !== "boolean") {
      return Response.json(
        { error: "exclude_slideshow 必须是布尔值" },
        { status: 400 }
      );
    }
    patch.exclude_slideshow = body.exclude_slideshow;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "请求体为空或没有可更新的字段" }, { status: 400 });
  }

  // 先查在不在:跟 DELETE 同样套路,区分 404 和 200。
  const { data: existing, error: selectErr } = await getSupabaseAdmin()
    .from("keywords")
    .select("id")
    .eq("id", id)
    .maybeSingle<Pick<KeywordRow, "id">>();

  if (selectErr) {
    console.error("[PATCH /api/keywords/:id] 查询失败", selectErr);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "keyword 不存在" }, { status: 404 });
  }

  try {
    await updateKeyword(id, patch);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/keywords/:id] 更新失败", err);
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}