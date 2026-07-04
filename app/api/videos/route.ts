import { NextResponse, type NextRequest } from "next/server";
import { listVideos } from "@/lib/supabase/queries";
import { ANALYSIS_STATUSES, SOURCE_TYPES } from "@/types";
import type { AnalysisStatus, SourceType } from "@/types";

/**
 * GET /api/videos?page=1&pageSize=20&status=completed&sourceType=keyword_search&authorId=xxx
 *
 * Query:
 *   page        默认 1
 *   pageSize    默认 20,最大 100
 *   status      可选,必须命中 ANALYSIS_STATUSES,否则 400
 *   sourceType  可选,必须命中 SOURCE_TYPES
 *   authorId    可选
 *
 * 200 → { videos: VideoListItem[], total, page, pageSize }
 * 400 → status 非法
 * 500 → 数据库/查询错误
 */

function parseInt32(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

/** 解析可选整数筛选参数(null/空/非数字 → null,不传给 query) */
function parseIntOrNull(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const page = parseInt32(params.get("page"), 1);
  if (page === null) {
    return NextResponse.json({ error: "page 必须是 >= 1 的整数" }, { status: 400 });
  }

  const pageSizeRaw = parseInt32(params.get("pageSize"), 20);
  if (pageSizeRaw === null) {
    return NextResponse.json({ error: "pageSize 必须是 >= 1 的整数" }, { status: 400 });
  }
  const pageSize = Math.min(pageSizeRaw, 100);

  const statusParam = params.get("status");
  if (statusParam && !ANALYSIS_STATUSES.includes(statusParam as AnalysisStatus)) {
    return NextResponse.json(
      { error: `status 非法,可选: ${ANALYSIS_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  const status = statusParam as AnalysisStatus | null;

  const sourceTypeParam = params.get("sourceType");
  if (sourceTypeParam && !SOURCE_TYPES.includes(sourceTypeParam as SourceType)) {
    return NextResponse.json(
      { error: `sourceType 非法,可选: ${SOURCE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const sourceType = sourceTypeParam as SourceType | null;

  const authorId = params.get("authorId");
  const sourceValue = params.get("sourceValue");
  const search = params.get("search");

  // 可选的数值筛选(非空才传)
  const minPlayCount = parseIntOrNull(params.get("minPlayCount"));
  const minLikeCount = parseIntOrNull(params.get("minLikeCount"));
  const minDurationSec = parseIntOrNull(params.get("minDurationSec"));
  const maxDurationSec = parseIntOrNull(params.get("maxDurationSec"));
  const publishedAfter = params.get("publishedAfter");

  try {
    const result = await listVideos({
      page,
      pageSize,
      status: status ?? undefined,
      sourceType: sourceType ?? undefined,
      authorId: authorId ?? undefined,
      sourceValue: sourceValue ?? undefined,
      search: search ?? undefined,
      minPlayCount: minPlayCount ?? undefined,
      minLikeCount: minLikeCount ?? undefined,
      minDurationSec: minDurationSec ?? undefined,
      maxDurationSec: maxDurationSec ?? undefined,
      publishedAfter: publishedAfter ?? undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[GET /api/videos] 查询失败", err);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
