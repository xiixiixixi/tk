import { listKeywordsWithStats, insertKeyword } from "@/lib/supabase/queries";
import type { KeywordInsert } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/keywords
 * 列出所有监控中的关键词,带采集统计(按 created_at 倒序)。
 *
 * 200 → { keywords: KeywordWithStats[] }   // 每项含 video_count / analyzed_count
 * 500 → 查询失败
 *
 * POST /api/keywords
 * 添加一个关键词到监控列表。
 *
 * 请求体:
 *   {
 *     keyword: string,                       // 必填,1-100 字符
 *     region?: string,                       // 可选,默认 'US'
 *     language?: string,                     // 可选,默认 'en'
 *     fetch_limit?: number,                  // 可选,1-200,默认 200
 *     monitor_frequency?: string,            // 可选,默认 'daily'
 *     // Phase 6 筛选条件(以下均可选,null/不传 = 该维度不限制)
 *     min_play_count?: number,               // 非负整数
 *     min_like_count?: number,               // 非负整数
 *     min_engagement_rate?: number,          // 0~1 之间(eg 0.05)
 *     published_after?: string,              // ISO 时间字符串
 *     min_duration_sec?: number,             // 非负整数,需 <= max_duration_sec
 *     max_duration_sec?: number,             // 非负整数
 *     unwanted_hashtags?: string[],          // hashtag 黑名单
 *     exclude_slideshow?: boolean,           // 默认 true,不传则让 DB 默认生效
 *   }
 *
 * 201 → { keyword: string, status: 'active' }
 * 400 → 缺字段 / 长度越界 / 数值越界 / 时间格式非法 / 持续时长矛盾
 * 500 → 写库失败
 */

const KEYWORD_MAX_LENGTH = 100;
const FETCH_LIMIT_MIN = 1;
const FETCH_LIMIT_MAX = 200;

function isValidKeyword(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= KEYWORD_MAX_LENGTH;
}

function parseNonNegativeInteger(
  value: unknown,
  fieldName: string
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${fieldName} 必须是非负整数` };
  }
  return { ok: true, value: n };
}

function parseEngagementRate(
  value: unknown
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return { ok: false, error: "min_engagement_rate 必须是 0~1 之间的数" };
  }
  return { ok: true, value: n };
}

function parseIsoDate(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "published_after 必须是 ISO 时间字符串" };
  }
  if (Number.isNaN(Date.parse(value))) {
    return { ok: false, error: "published_after 必须是合法的 ISO 时间字符串" };
  }
  return { ok: true, value };
}

function parseStringArray(
  value: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "unwanted_hashtags 必须是 string[]" };
  }
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, error: "unwanted_hashtags 元素必须都是字符串" };
    }
  }
  return { ok: true, value: value as string[] };
}

export async function GET() {
  try {
    const keywords = await listKeywordsWithStats();
    return Response.json({ keywords }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/keywords] 查询失败", err);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<KeywordInsert> & { keyword?: unknown };

    if (!isValidKeyword(body.keyword)) {
      return Response.json(
        { error: `keyword 必填,长度 1-${KEYWORD_MAX_LENGTH} 字符` },
        { status: 400 }
      );
    }

    let fetchLimit: number | undefined;
    if (body.fetch_limit !== undefined && body.fetch_limit !== null) {
      const n = Number(body.fetch_limit);
      if (!Number.isInteger(n) || n < FETCH_LIMIT_MIN || n > FETCH_LIMIT_MAX) {
        return Response.json(
          { error: `fetch_limit 必须是 ${FETCH_LIMIT_MIN}-${FETCH_LIMIT_MAX} 的整数` },
          { status: 400 }
        );
      }
      fetchLimit = n;
    }

    // 筛选字段:逐项校验,只把传了且合法的写进 insert。
    let minPlayCount: number | undefined;
    if (body.min_play_count !== undefined && body.min_play_count !== null) {
      const r = parseNonNegativeInteger(body.min_play_count, "min_play_count");
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      minPlayCount = r.value;
    }

    let minLikeCount: number | undefined;
    if (body.min_like_count !== undefined && body.min_like_count !== null) {
      const r = parseNonNegativeInteger(body.min_like_count, "min_like_count");
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      minLikeCount = r.value;
    }

    let minEngagementRate: number | undefined;
    if (body.min_engagement_rate !== undefined && body.min_engagement_rate !== null) {
      const r = parseEngagementRate(body.min_engagement_rate);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      minEngagementRate = r.value;
    }

    let publishedAfter: string | undefined;
    if (body.published_after !== undefined && body.published_after !== null) {
      const r = parseIsoDate(body.published_after);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      publishedAfter = r.value;
    }

    let minDurationSec: number | undefined;
    if (body.min_duration_sec !== undefined && body.min_duration_sec !== null) {
      const r = parseNonNegativeInteger(body.min_duration_sec, "min_duration_sec");
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      minDurationSec = r.value;
    }

    let maxDurationSec: number | undefined;
    if (body.max_duration_sec !== undefined && body.max_duration_sec !== null) {
      const r = parseNonNegativeInteger(body.max_duration_sec, "max_duration_sec");
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      maxDurationSec = r.value;
    }

    if (minDurationSec !== undefined && maxDurationSec !== undefined && minDurationSec > maxDurationSec) {
      return Response.json(
        { error: "min_duration_sec 必须 <= max_duration_sec" },
        { status: 400 }
      );
    }

    let unwantedHashtags: string[] | undefined;
    if (body.unwanted_hashtags !== undefined && body.unwanted_hashtags !== null) {
      const r = parseStringArray(body.unwanted_hashtags);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      unwantedHashtags = r.value;
    }

    // exclude_slideshow 不传则不写入,让 DB 默认(true)生效。
    const excludeSlideshow: boolean | undefined =
      typeof body.exclude_slideshow === "boolean" ? body.exclude_slideshow : undefined;

    const insert: KeywordInsert = {
      keyword: body.keyword.trim(),
      ...(body.region != null ? { region: String(body.region) } : {}),
      ...(body.language != null ? { language: String(body.language) } : {}),
      ...(fetchLimit != null ? { fetch_limit: fetchLimit } : {}),
      ...(body.monitor_frequency != null
        ? { monitor_frequency: String(body.monitor_frequency) }
        : {}),
      ...(minPlayCount !== undefined ? { min_play_count: minPlayCount } : {}),
      ...(minLikeCount !== undefined ? { min_like_count: minLikeCount } : {}),
      ...(minEngagementRate !== undefined ? { min_engagement_rate: minEngagementRate } : {}),
      ...(publishedAfter !== undefined ? { published_after: publishedAfter } : {}),
      ...(minDurationSec !== undefined ? { min_duration_sec: minDurationSec } : {}),
      ...(maxDurationSec !== undefined ? { max_duration_sec: maxDurationSec } : {}),
      ...(unwantedHashtags !== undefined ? { unwanted_hashtags: unwantedHashtags } : {}),
      ...(excludeSlideshow !== undefined ? { exclude_slideshow: excludeSlideshow } : {}),
    };

    await insertKeyword(insert);

    // fire-and-forget 触发抓取 — 让新关键词立刻有反馈,不依赖 cron 下次 schedule
    const cronSecret = process.env.CRON_SECRET;
    const port = process.env.PORT || "3000";
    void fetch(`http://localhost:${port}/api/cron/search-keywords`, {
      cache: "no-store",
      headers: cronSecret ? { "x-cron-secret": cronSecret } : {},
    }).catch((e) =>
      console.error("[keywords POST] trigger search-keywords error:", e)
    );

    return Response.json(
      { keyword: insert.keyword, status: "active" },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `添加关键词失败: ${message}` }, { status: 500 });
  }
}