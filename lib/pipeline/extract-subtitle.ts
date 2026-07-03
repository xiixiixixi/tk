import { insertVideoAsset } from "@/lib/supabase/queries";
import { getRunDataset } from "@/lib/apify/client";
import { transcribeVideo } from "@/lib/whisper/client";
import { assembleFallbackSubtitle } from "@/lib/pipeline/subtitle-utils";
import type { VideoRow } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";
import type { ApifyTikTokResult } from "@/types";

/**
 * Pipeline Step 3: 提取旁白/字幕(三级 fallback)
 *
 * 优先级(tech.md §7.5):
 *   1. Apify 字幕字段(textExtra / textLanguage)—— 新版 TikTok 基本为空
 *   2. Whisper ASR —— 配了 WHISPER_API_KEY 且视频已上传 R2 时,转录视频
 *   3. 文本拼接 —— title + description + hashtags(质量低但稳定)
 *
 * 产物:video_assets 表插一条 subtitle 类型,description = 完整旁白文本
 */
export default async function extractSubtitle(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus }> {
  // 1. 尝试从 Apify 字幕字段提取
  let subtitleText = await tryApifySubtitle(video);

  // 2. Apify 没字幕 → 尝试 Whisper(配了 key 且有 R2 视频)
  if (!subtitleText && video.video_file_url && process.env.WHISPER_API_KEY) {
    const whisperText = await transcribeVideo(video.video_file_url);
    if (whisperText) {
      subtitleText = whisperText;
    }
  }

  // 3. Whisper 也没 → 文本降级
  if (!subtitleText) {
    subtitleText = assembleFallbackSubtitle(video);
  }

  await insertVideoAsset(video.id, "subtitle", "", subtitleText);

  return { nextStatus: "audio_extracted" };
}

/**
 * 从 Apify dataset 的 textExtra 字段提取字幕
 *
 * ⚠️ 实测(2026-07)TikTok 新版基本不返回 textExtra 字幕,但保留兼容旧数据
 */
async function tryApifySubtitle(video: VideoRow): Promise<string | null> {
  if (!video.apify_run_id) return null;

  try {
    const dataset = await getRunDataset(video.apify_run_id);
    const data: ApifyTikTokResult | undefined = dataset.find(
      (d) => !d.error && d.id === video.tiktok_video_id
    ) ?? dataset.find((d) => !d.error);

    if (data?.textExtra && data.textExtra.length > 0) {
      const text = data.textExtra
        .map((t) => t.text)
        .filter(Boolean)
        .join(" ")
        .trim();
      return text || null;
    }
  } catch (err) {
    // Apify 拉失败不致命,继续走 Whisper / 降级
    console.warn(`[extract-subtitle] apify dataset 拉取失败:`, err);
  }

  return null;
}
