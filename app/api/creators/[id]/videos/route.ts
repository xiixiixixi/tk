import { NextResponse, type NextRequest } from "next/server";
import { getCreatorById, listVideos } from "@/lib/supabase/queries";
import { ANALYSIS_STATUSES } from "@/types";
import type { AnalysisStatus } from "@/types";
import type { ListVideosParams } from "@/lib/supabase/queries";

/**
 * GET /api/creators/:id/videos
 * 返回该博主名下所有视频(D5:优先按 author_id 查)。
 *
 * 步骤:
 *   1. UUID 校验
 *   2. 取 creator;creator_id 不为空 → author_id 过滤;为空 → 回退 sourceValue=creator_url + sourceType=creator_monitor
 *   3. 透传过滤/分页参数到 listVideos
 *
 * 数字/枚举参数非法一律忽略,不抛 400 — 前端可能传陈旧值,放宽更友好。
 *
 * 200 → { creator: CreatorRow, videos, total, page, pageSize }
 * 400 → id 不是 UUID
 * 404 → creator 不存在
 * 500 → 查询失败
 */

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseNumberOrNull(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "id 必须是合法的 UUID" }, { status: 400 });
  }

  let creator;
  try {
    const found = await getCreatorById(id);
    if (!found) {
      return NextResponse.json({ error: "creator 不存在" }, { status: 404 });
    }
    creator = found;
  } catch (err) {
    console.error("[GET /api/creators/:id/videos] 取 creator 失败", err);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }

  // 过滤策略:有 TikTok author_id 就用精确过滤;没有就回退到 sourceValue/sourceType 范围
  const filterFromCreator: Pick<ListVideosParams, "authorId" | "sourceValue" | "sourceType"> =
    creator.creator_id
      ? { authorId: creator.creator_id }
      : { sourceValue: creator.creator_url, sourceType: "creator_monitor" };

  const sp = req.nextUrl.searchParams;

  const statusParam = sp.get("status");
  const status: AnalysisStatus | undefined =
    statusParam && (ANALYSIS_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as AnalysisStatus)
      : undefined;

  const sortByParam = sp.get("sortBy");
  const sortBy: ListVideosParams["sortBy"] =
    sortByParam === "play_count" || sortByParam === "like_count" || sortByParam === "created_at"
      ? sortByParam
      : undefined;

  const sortDirParam = sp.get("sortDir");
  const sortDir: ListVideosParams["sortDir"] =
    sortDirParam === "asc" || sortDirParam === "desc" ? sortDirParam : undefined;

  try {
    const result = await listVideos({
      ...filterFromCreator,
      page: parseNumberOrNull(sp.get("page")) ?? undefined,
      pageSize: parseNumberOrNull(sp.get("pageSize")) ?? undefined,
      status,
      search: sp.get("search") ?? undefined,
      minPlayCount: parseNumberOrNull(sp.get("minPlayCount")) ?? undefined,
      minLikeCount: parseNumberOrNull(sp.get("minLikeCount")) ?? undefined,
      publishedAfter: sp.get("publishedAfter") ?? undefined,
      minDurationSec: parseNumberOrNull(sp.get("minDurationSec")) ?? undefined,
      maxDurationSec: parseNumberOrNull(sp.get("maxDurationSec")) ?? undefined,
      sortBy,
      sortDir,
    });

    return NextResponse.json(
      { creator, videos: result.videos, total: result.total, page: result.page, pageSize: result.pageSize },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/creators/:id/videos] 查询 videos 失败", err);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
