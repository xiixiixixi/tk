import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/client";
import { getVideoByTiktokId, insertVideo } from "@/lib/supabase/queries";
import { mockApifyVideo } from "@/lib/apify/mock";

export const dynamic = "force-dynamic";

/** Mock 模式默认每个关键词拉取的假视频数;实际 keyword.fetch_limit 优先级更高 */
const MOCK_DEFAULT_FETCH_LIMIT = 3;

/**
 * 为每个 active 关键词拉取搜索结果视频入库(Phase 4 验收补救)
 *
 * Mock 模式:lib/apify/mock 假数据 → INSERT videos(source_type='keyword_search')
 * 真实模式:Phase 5+ 接 Apify search API
 *
 * 入库后调 /api/cron/process 让 Phase 2 调度器接手分析。
 */
export async function GET() {
  const isMock = process.env.MOCK_APIFY === "true";

  // 1. 读所有 active keywords
  const { data: keywords, error: keywordsError } = await getSupabaseAdmin()
    .from("keywords")
    .select("*")
    .eq("status", "active");

  if (keywordsError) {
    return NextResponse.json(
      { processed: 0, error: keywordsError.message },
      { status: 200 }
    );
  }

  // 2. 非 Mock 模式
  if (!isMock) {
    return NextResponse.json({
      processed: 0,
      active_keywords: keywords?.length ?? 0,
      reason: "真实 Apify search 待 Phase 5+ 实现;Mock 模式可用(MOCK_APIFY=true)",
    });
  }

  // 3. Mock 模式:为每个关键词生成 N 个假搜索结果入库
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const keyword of keywords ?? []) {
    const limit = keyword.fetch_limit ?? MOCK_DEFAULT_FETCH_LIMIT;
    const keywordSlug = keyword.keyword.replace(/\s+/g, "-").slice(0, 30);

    for (let i = 0; i < limit; i++) {
      try {
        const tiktokId = `mock_kw_${keyword.id.slice(0, 8)}_${Date.now()}_${i}`;
        const existing = await getVideoByTiktokId(tiktokId);
        if (existing) {
          skipped++;
          continue;
        }

        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(keyword.keyword)}&result=${i}`;
        const mock = mockApifyVideo(searchUrl);
        const { id: _, ...mockRest } = mock;

        await insertVideo({
          source_type: "keyword_search",
          source_value: keyword.keyword,
          tiktok_video_id: tiktokId,
          original_url: searchUrl,
          title: `${keyword.keyword} - ${mock.text ?? `结果 ${i + 1}`}`,
          description: mock.text ?? null,
          author_id: mock.authorMeta?.id ?? null,
          author_name: mock.authorMeta?.name ?? `相关博主 ${keywordSlug}`,
          publish_time: mock.createTime ?? null,
          duration: mock.videoMeta?.duration ?? null,
          play_count: mock.playCount ?? 0,
          like_count: mock.diggCount ?? 0,
          comment_count: mock.commentCount ?? 0,
          share_count: mock.shareCount ?? 0,
          collect_count: mock.collectCount ?? 0,
          hashtags: mock.hashtags?.map((h) => h.name) ?? null,
          cover_url: mock.videoMeta?.coverUrl ?? null,
        });
        created++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // 4. 更新 last_fetch_time
  if ((keywords?.length ?? 0) > 0) {
    await getSupabaseAdmin()
      .from("keywords")
      .update({ last_fetch_time: new Date().toISOString() })
      .eq("status", "active");
  }

  // 5. 触发调度器 — fire-and-forget(理由同 monitor-creators)
  if (created > 0) {
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`, {
      cache: "no-store",
    }).catch((e) => {
      console.error("trigger pipeline error:", e);
    });
  }

  return NextResponse.json({
    processed: created,
    skipped,
    active_keywords: keywords?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
