import type { ApifyTikTokResult } from "@/types";

/**
 * Apify TikTok Scraper 封装
 * Actor: clockworks/tiktok-scraper
 * 基础 URL: https://api.apify.com/v2
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "clockworks~tiktok-scraper";

function getApifyToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error("APIFY_API_KEY 缺失(开发期可走 MOCK)");
  return token;
}

/**
 * 启动 Apify Actor run,返回 runId
 * 立刻返回,实际抓取在后台 ~5-20s 完成
 */
export async function startActorRun(videoUrl: string): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApifyToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startUrls: [{ url: videoUrl }],
      downloadVideos: true,
      downloadCovers: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apify startActor ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.data.id as string;
}

/**
 * 查询 run 状态
 */
export async function getRunStatus(
  runId: string
): Promise<"RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED"> {
  const res = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs/${runId}`, {
    headers: { Authorization: `Bearer ${getApifyToken()}` },
  });
  if (!res.ok) throw new Error(`Apify getRun ${res.status}`);
  const data = await res.json();
  return data.data.status;
}

/**
 * 拉取 run 输出的 dataset(items 数组)
 * 一次抓一条视频,所以通常返回数组长度是 1
 */
export async function getRunDataset(runId: string): Promise<ApifyTikTokResult[]> {
  const res = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs/${runId}/dataset/items`, {
    headers: { Authorization: `Bearer ${getApifyToken()}` },
  });
  if (!res.ok) throw new Error(`Apify getDataset ${res.status}`);
  return res.json();
}

/**
 * 判断是否走 Mock(没配 key 或 MOCK_APIFY=true)
 */
export function shouldUseApifyMock(): boolean {
  return !process.env.APIFY_API_KEY || process.env.MOCK_APIFY === "true";
}
