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
 *   1. Apify 字幕(videoMeta.subtitleLinks)— 下载 WEBVTT,解析成纯文本(最准,带时间轴)
 *   2. 文本降级 — title + description + hashtags 拼接
 *
 * 字幕来源说明(Apify subtitleLinks[].source):
 *   - ASR  TikTok 自动语音识别(准确性高,推荐)
 *   - MT   机器翻译(可能不如 ASR 准,但仍可用)
 *
 * 没字幕的视频:不在这里做 ASR。
 * Gemini 在 Step 4 通过视频输入(含音轨)自己听口播,实测能逐字转录,
 * 所以"没字幕"的场景由 Gemini 兜底,这步只存能拿到的字幕。
 */
export default async function extractSubtitle(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus }> {
  // 1. 尝试下载 Apify 字幕
  let subtitleText = await tryApifySubtitle(video);

  // 2. 没字幕 → 文本降级(只是辅助上下文,Gemini 会自己听音频)
  if (!subtitleText) {
    subtitleText = assembleFallbackSubtitle(video);
  }

  await insertVideoAsset(video.id, "subtitle", "", subtitleText);

  return { nextStatus: "audio_extracted" };
}

/**
 * 从 Apify dataset 拿 subtitleLinks,下载 WEBVTT 并解析成纯文本
 *
 * 优先选 source=ASR 的(自动语音识别,最准),其次 MT(机器翻译)
 */
async function tryApifySubtitle(video: VideoRow): Promise<string | null> {
  if (!video.apify_run_id) return null;

  try {
    const dataset = await getRunDataset(video.apify_run_id);
    const data: ApifyTikTokResult | undefined =
      dataset.find((d) => !d.error && d.id === video.tiktok_video_id) ??
      dataset.find((d) => !d.error);

    if (!data) return null;

    const subs = data.videoMeta?.subtitleLinks;
    if (!subs || subs.length === 0) return null;

    // 优先 ASR(自动语音识别),其次 MT,再其次任意
    const preferred =
      subs.find((s) => /ASR/i.test(s.source || "")) ??
      subs.find((s) => /MT/i.test(s.source || "")) ??
      subs[0];

    if (!preferred?.downloadLink) return null;

    console.log(
      `[extract-subtitle] 找到字幕 source=${preferred.source} lang=${preferred.language},下载中...`
    );

    // 下载 WEBVTT
    const res = await fetch(preferred.downloadLink);
    if (!res.ok) {
      console.warn(`[extract-subtitle] 字幕下载失败: ${res.status}`);
      return null;
    }
    const vttText = await res.text();
    const plain = parseWebVtt(vttText);

    if (plain && plain.trim().length > 0) {
      console.log(
        `[extract-subtitle] 字幕解析成功,${plain.length} 字符: ${plain.slice(0, 40)}...`
      );
      return plain;
    }
    return null;
  } catch (err) {
    console.warn(`[extract-subtitle] apify 字幕拉取失败:`, err);
    return null;
  }
}

/**
 * 把 WEBVTT 字幕解析成纯文本(去掉时间轴和序号)
 *
 * 输入示例:
 *   WEBVTT
 *   00:00:02.280 --> 00:00:03.080
 *   In the name of Allah
 *
 * 输出: "In the name of Allah"
 */
export function parseWebVtt(vtt: string): string {
  return vtt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      // 去掉空行、WEBVTT 头、时间轴行、纯数字序号行
      if (!line) return false;
      if (/^WEBVTT/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false; // 序号
      if (/-->/.test(line)) return false; // 时间轴
      return true;
    })
    .join(" ")
    // 合并多余空格
    .replace(/\s+/g, " ")
    .trim();
}
