import { NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/auth/cron";
import {
  getVideoByTiktokId,
  insertVideo,
  listCreators,
  updateCreator,
  updateVideo,
} from "@/lib/supabase/queries";
import {
  creatorFirstFetchLimit,
  creatorIncrementalLimit,
  extractProfileHandle,
  getRunDataset,
  getRunStatus,
  shouldUseApifyMock,
  startCreatorRun,
} from "@/lib/apify/client";
import { mockApifyVideo } from "@/lib/apify/mock";
import { apifyResultToVideoUpdate } from "@/lib/apify/mapper";
import type { CreatorRow } from "@/lib/pipeline/types";
import type { ApifyTikTokResult } from "@/types";

export const dynamic = "force-dynamic";

/**
 * 抓取所有 active 博主最新视频入库
 *
 * - Mock 模式:每个博主生成 N 个假视频,首次 insert / 后续 refresh
 * - 真实模式:对每个博主 startCreatorRun → 轮询 → dataset → 新视频入库,老视频只刷新互动指标
 *
 * D2:首次订阅采最近 creatorFirstFetchLimit() 条,后续增量采 creatorIncrementalLimit() 条
 * D3:采回来全部自动解析(insertVideo 后触发 /api/cron/process)
 * D4:老视频只刷新本轮 Apify 返回的、库里已存在的那批的互动指标(不重新解析)
 *
 * 入库后调 /api/cron/process 让 Phase 2 调度器接手分析。
 */
export async function GET(req: Request) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const isMock = shouldUseApifyMock();

  // 1. 读所有 active creators
  let activeCreators: CreatorRow[];
  try {
    const all = await listCreators();
    activeCreators = all.filter((c) => c.status === "active");
  } catch (err) {
    return NextResponse.json(
      {
        processed: 0,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }

  if (activeCreators.length === 0) {
    return NextResponse.json({ processed: 0, active_creators: 0 });
  }

  let created = 0;
  let refreshed = 0;
  const errors: string[] = [];

  for (const creator of activeCreators) {
    try {
      // D2:首次订阅采最近 N 条,后续增量采 M 条
      const isFirstFetch = creator.last_fetch_time == null;
      const limit = isFirstFetch
        ? creatorFirstFetchLimit()
        : creatorIncrementalLimit();

      const videos = isMock
        ? await mockCreatorVideos(creator, limit)
        : await fetchRealCreatorVideos(creator, limit);

      // D5:首次采集时补全 creator_id / creator_name,后续可按 author_id 查视频
      // 只在 creator_id 为空时补,避免覆盖人工校正过的值
      if (isFirstFetch && !creator.creator_id) {
        const firstValid = videos.find((v) => v.authorMeta?.id);
        if (firstValid?.authorMeta) {
          await updateCreator(creator.id, {
            creator_id: firstValid.authorMeta.id,
            creator_name:
              firstValid.authorMeta.name ?? creator.creator_name ?? null,
          });
        }
      }

      let creatorCreated = 0;
      for (const data of videos) {
        if (!data.id) continue;

        const existing = await getVideoByTiktokId(data.id);
        if (existing) {
          // D4:老视频只刷新互动指标 + last_metric_update_time,不动 analysis_status
          const m = apifyResultToVideoUpdate(data);
          await updateVideo(existing.id, {
            play_count: m.play_count,
            like_count: m.like_count,
            comment_count: m.comment_count,
            share_count: m.share_count,
            collect_count: m.collect_count,
            last_metric_update_time:
              m.last_metric_update_time ?? new Date().toISOString(),
          });
          refreshed++;
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
        creatorCreated++;
      }

      // per-creator 更新 last_fetch_time + last_fetch_video_count
      // (last_fetch_video_count 只统计本轮新增,刷新不计)
      await updateCreator(creator.id, {
        last_fetch_time: new Date().toISOString(),
        last_fetch_video_count: creatorCreated,
      });
    } catch (err) {
      errors.push(
        `creator ${creator.creator_name ?? creator.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // D3:有新视频入库才触发调度器(fire-and-forget)
  if (created > 0) {
    const secret = process.env.CRON_SECRET;
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`, {
      cache: "no-store",
      headers: secret ? { "x-cron-secret": secret } : {},
    }).catch((e) => console.error("trigger pipeline error:", e));
  }

  return NextResponse.json({
    processed: created,
    refreshed,
    active_creators: activeCreators.length,
    mode: isMock ? "mock" : "real",
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ============================================================
// Mock 模式:生成假视频(用稳定的 mock id,支持去重 / refresh)
// 首次订阅和后续增量都走同一套:固定 id 让去重稳定,首次 insert,后续 refresh
// ============================================================
async function mockCreatorVideos(
  creator: { id: string; creator_url: string },
  limit: number
): Promise<ApifyTikTokResult[]> {
  const handle = extractProfileHandle(creator.creator_url) ?? "mock_creator";
  const videos: ApifyTikTokResult[] = [];
  for (let i = 0; i < limit; i++) {
    const mockId = `mock_creator_${handle}_${i}`;
    const v = mockApifyVideo(`${creator.creator_url}?video=${i}`);
    // 覆盖 id 让去重稳定:同一博主反复触发不会无限新增
    v.id = mockId;
    v.authorMeta.name = handle;
    videos.push(v);
  }
  return videos;
}

// ============================================================
// 真实模式:startCreatorRun → 轮询 → dataset
// ============================================================
async function fetchRealCreatorVideos(
  creator: { creator_url: string },
  resultsPerPage: number
): Promise<ApifyTikTokResult[]> {
  const handle = extractProfileHandle(creator.creator_url);
  if (!handle) {
    throw new Error(`无法从 URL 提取博主 handle: ${creator.creator_url}`);
  }

  const runId = await startCreatorRun(handle, resultsPerPage);
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