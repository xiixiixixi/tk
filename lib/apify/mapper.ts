import type { ApifyTikTokResult } from "@/types";
import type { VideoUpdate } from "@/lib/pipeline/types";

/**
 * Apify TikTok 返回 → video UPDATE 字段映射(权威版)
 *
 * 共享给 fetch-metadata.ts(mocks)和 poll-apify.ts(真 Apify)
 * 写在这里一处,避免双份定义飘移
 *
 * last_metric_update_time 字段:每次拉数据都更新成"现在",方便后续 metrics 监控
 */
export function apifyResultToVideoUpdate(data: ApifyTikTokResult): VideoUpdate {
  return {
    tiktok_video_id: data.id ?? null,
    title: data.text ?? null,
    description: data.text ?? null,
    author_id: data.authorMeta?.id ?? null,
    author_name: data.authorMeta?.name ?? null,
    publish_time: data.createTime ?? null,
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
