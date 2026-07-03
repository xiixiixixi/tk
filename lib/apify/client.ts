import type { ApifyTikTokResult } from "@/types";

/**
 * Apify TikTok Scraper 封装
 * Actor: clockworks/tiktok-scraper
 * 基础 URL: https://api.apify.com/v2
 *
 * 三种抓取模式(对应 Phase 4 的三种任务来源):
 *   - postURLs   单个视频 URL(用户手动粘贴 analyze_video)
 *   - profiles   博主主页(monitor_creator)
 *   - searchQueries 关键词搜索(search_keyword)
 *
 * ⚠️ 字段名以 Apify 实测为准(2026-07):
 *   - 输入字段是 postURLs / profiles / searchQueries(不是 tech.md 旧写的 startUrls)
 *   - dataset 用 /datasets/{id}/items 而非 /runs/{id}/dataset/items
 *   - videoMeta.downloadUrl 新版常为空,视频地址改看 mediaUrls / submittedVideoUrl
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "clockworks~tiktok-scraper";

function getApifyToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error("APIFY_API_KEY 缺失(开发期可走 MOCK)");
  return token;
}

/** 启动 run 的通用方法,输入字段由调用方决定 */
async function startRun(input: Record<string, unknown>): Promise<string> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${getApifyToken()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`Apify startRun ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.id as string;
}

/** 查询 run 状态 */
export async function getRunStatus(
  runId: string
): Promise<"RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED"> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs/${runId}?token=${getApifyToken()}`
  );
  if (!res.ok) throw new Error(`Apify getRun ${res.status}`);
  const data = await res.json();
  return data.data.status;
}

/**
 * 拉 run 的 dataset items。
 * ⚠️ 用 run detail 拿 defaultDatasetId,再调 /datasets/{id}/items
 *    (旧的 /runs/{id}/dataset/items 路径已 404)
 */
export async function getRunDataset(
  runId: string
): Promise<ApifyTikTokResult[]> {
  // 先拿 defaultDatasetId
  const runRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs/${runId}?token=${getApifyToken()}`
  );
  if (!runRes.ok) throw new Error(`Apify getRun ${runRes.status}`);
  const runData = (await runRes.json()).data;
  const datasetId = runData.defaultDatasetId;
  if (!datasetId) throw new Error(`run ${runId} 无 defaultDatasetId`);

  const dsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${getApifyToken()}`
  );
  if (!dsRes.ok) throw new Error(`Apify getDataset ${dsRes.status}`);
  return (await dsRes.json()) as ApifyTikTokResult[];
}

// ============================================================
// 三种抓取模式的启动入口
// ============================================================

/** 单视频抓取(analyze_video 任务) */
export async function startActorRun(videoUrl: string): Promise<string> {
  return startRun({
    postURLs: [videoUrl],
    downloadVideos: true,
    downloadCovers: true,
  });
}

/** 博主主页抓取(monitor_creator),返回 runId */
export async function startCreatorRun(
  profileHandle: string,
  resultsPerPage = 10
): Promise<string> {
  return startRun({
    profiles: [profileHandle],
    resultsPerPage,
    downloadVideos: false, // 监控模式只要元数据,省额度
    downloadCovers: false,
  });
}

/** 关键词搜索(search_keyword),返回 runId */
export async function startSearchRun(
  query: string,
  resultsPerPage = 20
): Promise<string> {
  return startRun({
    searchQueries: [query],
    resultsPerPage,
    downloadVideos: false,
    downloadCovers: false,
  });
}

/**
 * 是否走 Mock(没配 key 或 MOCK_APIFY=true)
 */
export function shouldUseApifyMock(): boolean {
  return !process.env.APIFY_API_KEY || process.env.MOCK_APIFY === "true";
}

/**
 * 从博主主页 URL 提取 handle(@username)
 * https://www.tiktok.com/@username → username
 */
export function extractProfileHandle(creatorUrl: string): string | null {
  const m = creatorUrl.match(/tiktok\.com\/@([\w._-]+)/i);
  return m ? m[1] : null;
}
