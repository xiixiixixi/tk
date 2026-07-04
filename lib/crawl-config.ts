import { getSupabaseAdmin } from "@/lib/supabase/client";

/**
 * crawl_config 表读取工具
 * 所有 cron 端点(monitor-creators / search-keywords / cleanup)共用
 */

export interface CrawlConfig {
  max_age_months: number;
  exclude_slideshow: boolean;
  max_duration_sec: number;
  min_like_count: number;
  min_comment_count: number;
  min_play_count: number;
  min_share_count: number;
  min_collect_count: number;
}

const DEFAULTS: CrawlConfig = {
  max_age_months: 3,
  exclude_slideshow: true,
  max_duration_sec: 60,
  min_like_count: 0,
  min_comment_count: 0,
  min_play_count: 10000,
  min_share_count: 0,
  min_collect_count: 0,
};

/** 读取指定 scope 的全局配置,没有则返回默认值 */
export async function getCrawlConfig(scope: "creator" | "keyword"): Promise<CrawlConfig> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("crawl_config")
      .select("*")
      .eq("scope", scope)
      .maybeSingle();
    if (error || !data) return DEFAULTS;
    return {
      max_age_months: data.max_age_months ?? DEFAULTS.max_age_months,
      exclude_slideshow: data.exclude_slideshow ?? DEFAULTS.exclude_slideshow,
      max_duration_sec: data.max_duration_sec ?? DEFAULTS.max_duration_sec,
      min_like_count: data.min_like_count ?? DEFAULTS.min_like_count,
      min_comment_count: data.min_comment_count ?? DEFAULTS.min_comment_count,
      min_play_count: data.min_play_count ?? DEFAULTS.min_play_count,
      min_share_count: data.min_share_count ?? DEFAULTS.min_share_count,
      min_collect_count: data.min_collect_count ?? DEFAULTS.min_collect_count,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * 判断一个 Apify 视频是否符合全局采集条件
 * 用于 monitor-creators / search-keywords 入库前过滤
 */
export function passesCrawlFilter(
  video: {
    playCount?: number;
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
    isSlideshow?: boolean;
    videoMeta?: { duration?: number };
    createTime?: string;
    createTimeISO?: string;
  },
  config: CrawlConfig
): boolean {
  // 播放量
  if (config.min_play_count > 0 && (video.playCount ?? 0) < config.min_play_count) return false;
  // 点赞
  if (config.min_like_count > 0 && (video.diggCount ?? 0) < config.min_like_count) return false;
  // 评论
  if (config.min_comment_count > 0 && (video.commentCount ?? 0) < config.min_comment_count) return false;
  // 分享
  if (config.min_share_count > 0 && (video.shareCount ?? 0) < config.min_share_count) return false;
  // 收藏
  if (config.min_collect_count > 0 && (video.collectCount ?? 0) < config.min_collect_count) return false;
  // 时长上限
  if (config.max_duration_sec > 0 && (video.videoMeta?.duration ?? 0) > config.max_duration_sec) return false;
  // 图文(slideshow)
  if (config.exclude_slideshow && video.isSlideshow) return false;
  // 时间范围
  if (config.max_age_months < 9999) {
    const publishDate = video.createTimeISO
      ? new Date(video.createTimeISO)
      : video.createTime && /^\d+$/.test(String(video.createTime))
        ? new Date(Number(video.createTime) * 1000)
        : video.createTime
          ? new Date(video.createTime)
          : null;
    if (publishDate) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - config.max_age_months);
      if (publishDate < cutoff) return false;
    }
  }
  return true;
}
