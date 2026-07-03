import type { VideoRow } from "@/lib/pipeline/types";

/**
 * 降级旁白文本组装
 *
 * 没有 Apify 字幕时,把 video 的标题、描述、hashtags 拼成一段"推测旁白"。
 * 注意:这只是辅助上下文,Gemini 通过视频本身就能听到完整口播(实测验证),
 *      这里的拼接主要是给没视频文件的降级场景用。
 */
export function assembleFallbackSubtitle(video: VideoRow): string {
  const parts: string[] = [];
  if (video.title) parts.push(video.title);
  if (video.description) parts.push(video.description);
  if (video.hashtags && video.hashtags.length > 0) {
    parts.push(video.hashtags.join(" "));
  }
  return parts.filter(Boolean).join(" ").trim() || "(无旁白内容)";
}
