import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/client";
import { requireCronAuth } from "@/lib/auth/cron";
import {
  getVideoByTiktokId,
  insertVideo,
  updateVideo,
} from "@/lib/supabase/queries";
import {
  getRunDataset,
  getRunStatus,
  startCreatorRun,
  extractProfileHandle,
  shouldUseApifyMock,
} from "@/lib/apify/client";
import { mockApifyVideo } from "@/lib/apify/mock";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";

export const dynamic = "force-dynamic";

/**
 * 抓取所有 active 博主最新视频入库
 *
 * - Mock 模式:每个博主生成 3 个假视频入库
 * - 真实模式:对每个博主 startCreatorRun → 轮询 → dataset → 按真实 tiktok_video_id 去重入库
 *
 * 入库后调 /api/cron/process 让 Phase 2 调度器接手分析。
 */
export async function GET(req: Request) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const isMock = shouldUseApifyMock();

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

  if (!creators || creators.length === 0) {
    return NextResponse.json({ processed: 0, active_creators: 0 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const creator of creators) {
    try {
      const videos = isMock
        ? await mockCreatorVideos(creator)
        : await fetchRealCreatorVideos(creator);

      for (const data of videos) {
        // ⚠️ 真实去重:按 Apify 返回的真实 tiktok_video_id,不再用 Date.now()
        if (!data.id) {
          skipped++;
          continue;
        }
        const existing = await getVideoByTiktokId(data.id);
        if (existing) {
          skipped++;
          continue;
        }

        await insertVideo({
          source_type: "creator_monitor",
          source_value: creator.creator_url,
          tiktok_video_id: data.id,
          original_url: data.webVideoUrl ?? creator.creator_url,
          ...apifyResultToVideoUpdate(data),
        });
        created++;
      }
    } catch (err) {
      errors.push(
        `creator ${creator.creator_name ?? creator.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 更新 last_fetch_time
  await getSupabaseAdmin()
    .from("creators")
    .update({ last_fetch_time: new Date().toISOString() })
    .eq("status", "active");

  // 触发调度器(fire-and-forget)
  if (created > 0) {
    const secret = process.env.CRON_SECRET;
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`, {
      cache: "no-store",
      headers: secret ? { "x-cron-secret": secret } : {},
    }).catch((e) => console.error("trigger pipeline error:", e));
  }

  return NextResponse.json({
    processed: created,
    skipped,
    active_creators: creators.length,
    mode: isMock ? "mock" : "real",
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ============================================================
// Mock 模式:生成假视频(用稳定的 mock id,支持去重)
// ============================================================
const MOCK_VIDEOS_PER_CREATOR = 3;

async function mockCreatorVideos(creator: {
  id: string;
  creator_url: string;
}) {
  const handle = extractProfileHandle(creator.creator_url) ?? "mock_creator";
  const videos = [];
  for (let i = 0; i < MOCK_VIDEOS_PER_CREATOR; i++) {
    // 稳定 id:同一个博主反复触发不会无限产生(去重生效)
    const mockId = `mock_creator_${handle}_${i}`;
    videos.push(mockApifyVideo(`${creator.creator_url}?video=${i}`));
    // 覆盖 id 让去重稳定
    videos[i].id = mockId;
    videos[i].authorMeta.name = handle;
  }
  return videos;
}

// ============================================================
// 真实模式:startCreatorRun → 轮询 → dataset
// ============================================================
async function fetchRealCreatorVideos(creator: {
  creator_url: string;
}): Promise<ReturnType<typeof mockApifyVideo>[]> {
  const handle = extractProfileHandle(creator.creator_url);
  if (!handle) {
    throw new Error(`无法从 URL 提取博主 handle: ${creator.creator_url}`);
  }

  const runId = await startCreatorRun(handle, 10);
  // 轮询(最多 30s,Apify 博主抓取通常 5-15s)
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await getRunStatus(runId);
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${runId} ${status}`);
    }
    // RUNNING / TIMED-OUT 继续等
  }

  const dataset = await getRunDataset(runId);
  // 过滤掉 Apify 的 error item
  return dataset.filter((d) => !d.error);
}
