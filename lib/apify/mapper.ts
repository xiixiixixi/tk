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

/**
 * 关键词采集筛选条件(对应 keywords 表的筛选字段;null = 该维度不限制)
 */
export interface KeywordFilterCriteria {
  min_play_count: number | null;
  min_like_count: number | null;
  min_engagement_rate: number | null;
  published_after: string | null;
  min_duration_sec: number | null;
  max_duration_sec: number | null;
  unwanted_hashtags: string[] | null;
  exclude_slideshow: boolean;
}

/**
 * 判断一条 Apify 视频是否通过关键词筛选条件(入库前过滤,省解析成本)
 * @returns 通过返回 null;不通过返回被拒原因(用于日志/统计)
 */
export function keywordFilterReject(
  data: ApifyTikTokResult,
  c: KeywordFilterCriteria
): string | null {
  const play = data.playCount ?? 0;
  const like = data.diggCount ?? 0;
  const duration = data.videoMeta?.duration ?? 0;

  if (c.min_play_count != null && play < c.min_play_count) return "play_count";
  if (c.min_like_count != null && like < c.min_like_count) return "like_count";
  if (c.min_engagement_rate != null) {
    const rate = play > 0 ? like / play : 0;
    if (rate < c.min_engagement_rate) return "engagement_rate";
  }
  if (c.published_after) {
    const publishedAt = data.createTimeISO
      ? Date.parse(data.createTimeISO)
      : data.createTime && /^\d+$/.test(String(data.createTime))
        ? Number(data.createTime) * 1000
        : Date.parse(String(data.createTime));
    if (Number.isFinite(publishedAt) && publishedAt < Date.parse(c.published_after)) {
      return "published_after";
    }
  }
  if (c.min_duration_sec != null && duration < c.min_duration_sec) return "min_duration";
  if (c.max_duration_sec != null && duration > c.max_duration_sec) return "max_duration";
  if (c.unwanted_hashtags && c.unwanted_hashtags.length > 0) {
    const tags = new Set((data.hashtags ?? []).map((h) => h.name.toLowerCase()));
    for (const bad of c.unwanted_hashtags) {
      if (tags.has(bad.toLowerCase())) return "unwanted_hashtag";
    }
  }
  if (c.exclude_slideshow) {
    // slideshow 判定:无 mediaUrls 视频直链但有多图,或 Apify 标记 isSlideshow
    const isSlideshow =
      (data as { isSlideshow?: boolean }).isSlideshow === true ||
      (!data.mediaUrls?.length && !data.videoMeta?.downloadUrl && !data.submittedVideoUrl);
    if (isSlideshow) return "slideshow";
  }
  return null;
}
