import { listKeywords, insertKeyword } from "@/lib/supabase/queries";
import type { KeywordInsert } from "@/lib/pipeline/types";

/**
 * GET /api/keywords
 * 列出所有监控中的关键词(按 created_at 倒序)。
 *
 * 200 → { keywords: KeywordRow[] }
 * 500 → 查询失败
 *
 * POST /api/keywords
 * 添加一个关键词到监控列表。
 *
 * 请求体:
 *   {
 *     keyword: string,                       // 必填,1-100 字符
 *     region?: string,                       // 可选,默认 'US'
 *     language?: string,                      // 可选,默认 'en'
 *     fetch_limit?: number,                  // 可选,1-100,默认 20
 *     monitor_frequency?: string,            // 可选,默认 'daily'
 *   }
 *
 * 201 → { keyword: string, status: 'active' }
 * 400 → 缺字段 / 长度越界 / fetch_limit 越界
 * 500 → 写库失败
 */

const KEYWORD_MAX_LENGTH = 100;
const FETCH_LIMIT_MIN = 1;
const FETCH_LIMIT_MAX = 100;

function isValidKeyword(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= KEYWORD_MAX_LENGTH;
}

export async function GET() {
  try {
    const keywords = await listKeywords();
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

    const insert: KeywordInsert = {
      keyword: body.keyword.trim(),
      ...(body.region != null ? { region: String(body.region) } : {}),
      ...(body.language != null ? { language: String(body.language) } : {}),
      ...(fetchLimit != null ? { fetch_limit: fetchLimit } : {}),
      ...(body.monitor_frequency != null
        ? { monitor_frequency: String(body.monitor_frequency) }
        : {}),
    };

    await insertKeyword(insert);

    return Response.json(
      { keyword: insert.keyword, status: "active" },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json({ error: `添加关键词失败: ${message}` }, { status: 500 });
  }
}
