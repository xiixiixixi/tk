import { insertVideoAsset } from "@/lib/supabase/queries";
import { getRunDataset } from "@/lib/apify/client";
import { assembleFallbackSubtitle } from "@/lib/pipeline/subtitle-utils";
import type { VideoRow } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";
import type { ApifyTikTokResult } from "@/types";

/**
 * Pipeline Step 3: 提取字幕/旁白
 *
 * 优先级:
 *   1. Apify 字幕字段(textExtra)— 如果 Apify 返回了字幕,直接用(实测新版基本为空,但留着不亏)
 *   2. 文本降级 — title + description + hashtags 拼接
 *
 * ⚠️ 不再用 Whisper ASR:
 *   实测(2026-07)gemini-3.5-flash 通过 video_url 输入视频时,
 *   能同时理解画面 + 音频轨(逐字转录口播 + 识别音乐)。
 *   单独的 Whisper 转录是多余的 —— Gemini 自己听得见。
 *   测试证据:让 Gemini 转录视频音频,它返回了完整逐字口播文本。
 *
 * 产物:video_assets 表插一条 subtitle 类型,description = 字幕文本
 *       (Gemini 分析时会读这个字段作为辅助上下文)
 */
export default async function extractSubtitle(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus }> {
  // 1. 尝试从 Apify 字幕字段提取
  let subtitleText = await tryApifySubtitle(video);

  // 2. Apify 没字幕 → 文本降级
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
    // Apify 拉失败不致命,继续走文本降级
    console.warn(`[extract-subtitle] apify dataset 拉取失败:`, err);
  }

  return null;
}
