import type { VideoRow } from "@/lib/pipeline/types";

/**
 * 降级旁白文本组装
 *
 * 没有真实字幕(Apify 没返 + WHISPER_API_KEY 也没配)时,
 * 把 video 的标题、描述、hashtags 拼成一段"推测旁白"给 Gemini 当上下文。
 *
 * 与 lib/gemini/prompt.ts 的 buildAnalysisPrompt 里的 subtitleText 行为保持一致。
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
