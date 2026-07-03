import type { ApifyTikTokResult } from "@/types";
import type { VideoUpdate } from "@/lib/pipeline/types";

/**
 * Apify TikTok 返回 → video UPDATE 字段映射(权威版)
 *
 * 共享给 fetch-metadata.ts(mocks)和 poll-apify.ts(真 Apify)
 *
 * ⚠️ 字段映射以 Apify 实测为准(2026-07):
 *   - createTime 可能是数字时间戳(秒),createTimeISO 是 ISO 字符串,优先用 ISO
 *   - 视频下载地址:videoMeta.downloadUrl 新版常为空,改看 mediaUrls[0] / submittedVideoUrl
 *   - collectCount 在顶层,不在 videoMeta
 */
export function apifyResultToVideoUpdate(data: ApifyTikTokResult): VideoUpdate {
  // publish_time 优先 ISO,降级处理数字时间戳
  let publishTime: string | null = null;
  if (data.createTimeISO) {
    publishTime = data.createTimeISO;
  } else if (data.createTime) {
    // createTime 可能是秒级时间戳(数字)或已是 ISO 字符串
    const raw = data.createTime;
    if (/^\d+$/.test(String(raw))) {
      publishTime = new Date(Number(raw) * 1000).toISOString();
    } else {
      publishTime = String(raw);
    }
  }

  return {
    tiktok_video_id: data.id ?? null,
    title: data.text ?? null,
    description: data.text ?? null,
    author_id: data.authorMeta?.id ?? null,
    author_name: data.authorMeta?.name ?? null,
    publish_time: publishTime,
    duration: data.videoMeta?.duration ?? null,
    play_count: data.playCount ?? 0,
    like_count: data.diggCount ?? 0,
    comment_count: data.commentCount ?? 0,
    share_count: data.shareCount ?? 0,
    collect_count: data.collectCount ?? 0,
    hashtags: data.hashtags?.map((h) => h.name) ?? null,
    cover_url: data.videoMeta?.coverUrl ?? null,
    canonical_url: data.webVideoUrl ?? null,
    last_metric_update_time: new Date().toISOString(),
  };
}

/**
 * 从 Apify 结果提取视频下载 URL
 *
 * 优先级:mediaUrls[0] > submittedVideoUrl > videoMeta.downloadUrl
 * (新版 TikTok downloadUrl 常为空,mediaUrls 是主要来源)
 *
 * @returns 视频直链 URL,没有则 null(slideshow / 纯图视频可能没有)
 */
export function extractVideoDownloadUrl(data: ApifyTikTokResult): string | null {
  if (data.mediaUrls && data.mediaUrls.length > 0) {
    return data.mediaUrls[0];
  }
  if (data.submittedVideoUrl) {
    return data.submittedVideoUrl;
  }
  return data.videoMeta?.downloadUrl ?? null;
}

/**
 * 从 Apify 结果提取封面 URL
 */
export function extractCoverUrl(data: ApifyTikTokResult): string | null {
  return data.videoMeta?.coverUrl ?? null;
}
