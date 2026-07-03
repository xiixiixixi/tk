import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/client";
import { getVideoByTiktokId, insertVideo } from "@/lib/supabase/queries";
import { mockApifyVideo } from "@/lib/apify/mock";

export const dynamic = "force-dynamic";

/** Mock 模式下每个博主每次拉取的 mock 视频数;真实模式 Apify SDK 接后用 fetch_limit */
const MOCK_VIDEOS_PER_CREATOR = 3;

/**
 * 抓取所有 active 博主最新视频入库(Phase 4 验收补救)
 *
 * Mock 模式:lib/apify/mock 假数据 → INSERT videos(source_type='creator_monitor')
 * 真实模式:Phase 5+ 接 Apify user/creator scraping
 *
 * 入库后调 /api/cron/process 让 Phase 2 调度器接手分析。
 */
export async function GET() {
  const isMock = process.env.MOCK_APIFY === "true";

  // 1. 读所有 active creators
  const { data: creators, error: creatorsError } = await getSupabaseAdmin()
    .from("creators")
    .select("*")
    .eq("status", "active");

  if (creatorsError) {
    return NextResponse.json(
      { processed: 0, error: creatorsError.message },
      { status: 200 }
    );
  }

  // 2. 非 Mock 模式:暂未接真实 Apify,直接返 0(Phase 5+)
  if (!isMock) {
    return NextResponse.json({
      processed: 0,
      active_creators: creators?.length ?? 0,
      reason: "真实 Apify creator scraping 待 Phase 5+ 实现;Mock 模式可用(MOCK_APIFY=true)",
    });
  }

  // 3. Mock 模式:为每个 creator 生成 N 个假视频入库
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const creator of creators ?? []) {
    const mockAuthor = `${creator.creator_url}`; // 用 URL 当作者标识(matches 作者 URL)
    for (let i = 0; i < MOCK_VIDEOS_PER_CREATOR; i++) {
      try {
        const tiktokId = `mock_creator_${creator.id.slice(0, 8)}_${Date.now()}_${i}`;
        const existing = await getVideoByTiktokId(tiktokId);
        if (existing) {
          skipped++;
          continue;
        }

        const mock = mockApifyVideo(mockAuthor);
        const { id: _, ...mockRest } = mock; // 把 mock 自己的 id 拆掉,用我们的 tiktokId

        await insertVideo({
          source_type: "creator_monitor",
          source_value: creator.creator_url ?? null,
          tiktok_video_id: tiktokId,
          original_url: `${creator.creator_url ?? mockAuthor}?video=${Date.now()}_${i}`,
          title: mock.text ?? null,
          description: mock.text ?? null,
          author_id: creator.creator_id ?? mock.authorMeta?.id ?? null,
          author_name: creator.creator_name ?? mock.authorMeta?.name ?? null,
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
  if ((creators?.length ?? 0) > 0) {
    await getSupabaseAdmin()
      .from("creators")
      .update({ last_fetch_time: new Date().toISOString() })
      .eq("status", "active");
  }

  // 5. 触发调度器 — **fire-and-forget** 不 await(cron 跑 6 步可能 30s+,手动触发不该阻塞)
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
    active_creators: creators?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
