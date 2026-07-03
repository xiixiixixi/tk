import { insertVideoAsset } from "@/lib/supabase/queries";
import { assembleFallbackSubtitle } from "@/lib/pipeline/subtitle-utils";
import type { VideoRow } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

/**
 * Pipeline Step 3: 旁白提取
 *
 * - 有 WHISPER_API_KEY → OpenAI Whisper 转录 video_file_url(占位,Phase 5 实现)
 * - 无 → 降级:用 title + description + hashtags 拼成推测旁白
 *
 * 产物:
 * 1. video_assets 表插一条 subtitle 类型(descriptor = 完整拼接文本)
 * 2. 不写回 video.title/description(它们在 fetch-metadata 已写过,这里再写无效)
 *
 * 🟡 Phase 2.3 简化:Whisper 是 TODO。下次 fetch 时,Step 4 analyze-gemini
 *    自己重新组装 input.subtitleText(用同样逻辑),所以不存 subtitle 也能跑通链路。
 */
export default async function extractSubtitle(
  video: VideoRow
): Promise<{ nextStatus: "audio_extracted" }> {
  const subtitleText = process.env.WHISPER_API_KEY
    ? // TODO Phase 5: POST https://api.openai.com/v1/audio/transcriptions
      // body: { file: <下载 R2 视频>, model: "whisper-1" }
      assembleFallbackSubtitle(video) // 暂时用 fallback,等真接入 Whisper
    : assembleFallbackSubtitle(video);

  await insertVideoAsset(video.id, "subtitle", "", subtitleText);

  return { nextStatus: "audio_extracted" };
}
