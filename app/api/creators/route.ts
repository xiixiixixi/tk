import { listCreatorsWithStats, insertCreator } from "@/lib/supabase/queries";
import { normalizeCreatorInput } from "@/lib/apify/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/creators
 * 列出所有监控中的博主,带视频统计(按 author_id count)。
 *
 * 200 → { creators: CreatorWithStats[] }   // 每项含 video_count / analyzed_count
 * 500 → 查询失败
 *
 * POST /api/creators
 * 添加一个 TikTok 博主到监控列表。
 *
 * 请求体:
 *   {
 *     creator_url: string,       // 必填,接受 @username / username / 完整 URL
 *     category?: string,         // 可选,分类标签
 *   }
 *
 * 校验:
 *   - creator_url 必填,经 normalizeCreatorInput 归一化失败返回 400
 *
 * 201 → { creator_url: string, status: 'pending' }
 * 400 → 缺字段 / 输入无法识别为 TikTok 博主
 * 500 → 写库失败
 */

export async function GET() {
  try {
    const creators = await listCreatorsWithStats();
    return Response.json({ creators }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/creators] 查询失败", err);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      creator_url?: unknown;
      category?: unknown;
    };

    const rawInput = body.creator_url;
    if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
      return Response.json(
        { error: "creator_url 必填,接受 @username / username / 完整 TikTok URL" },
        { status: 400 }
      );
    }

    const normalized = normalizeCreatorInput(rawInput);
    if (!normalized) {
      return Response.json(
        { error: "无法识别为合法的 TikTok 博主(@username / username / 完整 URL)" },
        { status: 400 }
      );
    }

    const category =
      typeof body.category === "string" && body.category.trim().length > 0
        ? body.category.trim()
        : null;

    await insertCreator({
      creator_url: normalized.url,
      creator_name: normalized.handle,
      category,
    });

    return Response.json(
      { creator_url: normalized.url, status: "pending" },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `添加博主失败: ${message}` }, { status: 500 });
  }
}