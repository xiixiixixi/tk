import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/client";
import { getVideoByTiktokId, insertVideo } from "@/lib/supabase/queries";
import {
  getRunDataset,
  getRunStatus,
  startSearchRun,
  shouldUseApifyMock,
} from "@/lib/apify/client";
import { mockApifyVideo } from "@/lib/apify/mock";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";
import type { ApifyTikTokResult } from "@/types";

export const dynamic = "force-dynamic";

/**
 * 为每个 active 关键词拉取搜索结果视频入库
 *
 * - Mock 模式:每个关键词生成 N 个假视频入库
 * - 真实模式:startSearchRun → 轮询 → dataset → 按真实 tiktok_video_id 去重入库
 *
 * 入库后调 /api/cron/process 让 Phase 2 调度器接手分析。
 */
export async function GET() {
  const isMock = shouldUseApifyMock();

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

  if (!keywords || keywords.length === 0) {
    return NextResponse.json({ processed: 0, active_keywords: 0 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const keyword of keywords) {
    try {
      const videos = isMock
        ? mockKeywordVideos(keyword)
        : await fetchRealSearchVideos(keyword.keyword, keyword.fetch_limit ?? 20);

      for (const data of videos) {
        if (!data.id) {
          skipped++;
          continue;
        }
        // ⚠️ 真实去重:按 tiktok_video_id,不再用 Date.now()
        const existing = await getVideoByTiktokId(data.id);
        if (existing) {
          skipped++;
          continue;
        }

        await insertVideo({
          source_type: "keyword_search",
          source_value: keyword.keyword,
          tiktok_video_id: data.id,
          original_url: data.webVideoUrl ?? null,
          ...apifyResultToVideoUpdate(data),
        });
        created++;
      }
    } catch (err) {
      errors.push(
        `keyword "${keyword.keyword}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  await getSupabaseAdmin()
    .from("keywords")
    .update({ last_fetch_time: new Date().toISOString() })
    .eq("status", "active");

  if (created > 0) {
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`, {
      cache: "no-store",
    }).catch((e) => console.error("trigger pipeline error:", e));
  }

  return NextResponse.json({
    processed: created,
    skipped,
    active_keywords: keywords.length,
    mode: isMock ? "mock" : "real",
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ============================================================
// Mock 模式(稳定 id 支持去重)
// ============================================================
const MOCK_DEFAULT_FETCH_LIMIT = 3;

function mockKeywordVideos(keyword: { id: string; keyword: string; fetch_limit: number | null }) {
  const limit = keyword.fetch_limit ?? MOCK_DEFAULT_FETCH_LIMIT;
  const videos: ApifyTikTokResult[] = [];
  for (let i = 0; i < limit; i++) {
    const mock = mockApifyVideo(
      `https://www.tiktok.com/search?q=${encodeURIComponent(keyword.keyword)}&result=${i}`
    );
    // 稳定 id:同一关键词反复触发不会无限产生
    mock.id = `mock_kw_${keyword.id.slice(0, 8)}_${i}`;
    mock.text = `${keyword.keyword} - ${mock.text}`;
    videos.push(mock);
  }
  return videos;
}

// ============================================================
// 真实模式
// ============================================================
async function fetchRealSearchVideos(
  query: string,
  resultsPerPage: number
): Promise<ApifyTikTokResult[]> {
  const runId = await startSearchRun(query, resultsPerPage);
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await getRunStatus(runId);
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${runId} ${status}`);
    }
  }
  const dataset = await getRunDataset(runId);
  return dataset.filter((d) => !d.error);
}
