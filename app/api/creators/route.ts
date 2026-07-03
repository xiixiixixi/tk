import { listCreators, insertCreator } from "@/lib/supabase/queries";
import type { CreatorInsert } from "@/lib/pipeline/types";

/**
 * GET /api/creators
 * 列出所有监控中的博主(按 created_at 倒序)。
 *
 * 200 → { creators: CreatorRow[] }
 * 500 → 查询失败
 *
 * POST /api/creators
 * 添加一个 TikTok 博主到监控列表。
 *
 * 请求体:
 *   {
 *     creator_url: string,                  // 必填,TikTok 博主主页 URL
 *     creator_id?: string,                  // 可选,TikTok 内部 uid
 *     creator_name?: string,                // 可选,@用户名
 *     category?: string,                    // 可选,分类标签
 *     monitor_frequency?: string,           // 可选,默认 'daily'
 *   }
 *
 * 校验:
 *   - creator_url 必填,必须是 https://...tiktok.com/@xxx 形式
 *
 * 201 → { creator_url: string, status: 'pending' }
 * 400 → 缺字段 / URL 不合法
 * 500 → 写库失败
 */

// TikTok 博主主页 URL(只匹配 /@username 形式;短链 / 视频链不算博主主页)
// 形如 https://www.tiktok.com/@scout2015
const TIKTOK_CREATOR_URL_PATTERN =
  /^https?:\/\/(?:[a-z]{2}\.)?(?:www\.|m\.)?tiktok\.com\/@[\w._-]{1,24}\/?$/i;

function isValidCreatorUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return false;
  return TIKTOK_CREATOR_URL_PATTERN.test(trimmed);
}

export async function GET() {
  try {
    const creators = await listCreators();
    return Response.json({ creators }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/creators] 查询失败", err);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreatorInsert>;

    const creatorUrl = body.creator_url;
    if (!isValidCreatorUrl(creatorUrl)) {
      return Response.json(
        { error: "creator_url 必须是合法的 TikTok 博主主页 URL(https://www.tiktok.com/@username)" },
        { status: 400 }
      );
    }

    const insert: CreatorInsert = {
      creator_url: creatorUrl.trim(),
      ...(body.creator_id != null ? { creator_id: String(body.creator_id) } : {}),
      ...(body.creator_name != null ? { creator_name: String(body.creator_name) } : {}),
      ...(body.category != null ? { category: String(body.category) } : {}),
      ...(body.monitor_frequency != null
        ? { monitor_frequency: String(body.monitor_frequency) }
        : {}),
    };

    await insertCreator(insert);

    return Response.json(
      { creator_url: insert.creator_url, status: "pending" },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `添加博主失败: ${message}` }, { status: 500 });
  }
}