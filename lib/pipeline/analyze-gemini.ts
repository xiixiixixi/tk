import { analyzeVideo } from "@/lib/gemini/client";
import { insertAnalysis, updateVideo } from "@/lib/supabase/queries";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

const DEFAULT_MODEL = "google/gemini-3.5-flash";

/**
 * Pipeline Step 4: 组装分析包 + 调 Gemini
 *
 * - 从 video 字段组装 gemini.analyzeVideo 的入参
 * - subtitleText 重新组装(title + description + hashtags)
 * - 把整段 R2 视频 URL 传给 Gemini(v0.7 改:不抽关键帧)
 * - 写入 analysis_results(analysis_version=1)
 * - 把 video 标为 completed
 */
export default async function analyzeWithGemini(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  const subtitleText = assembleSubtitleText(video);
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const output = await analyzeVideo({
    title: video.title ?? "",
    description: video.description ?? "",
    authorName: video.author_name ?? "",
    publishTime: video.publish_time ?? "",
    duration: video.duration ?? 0,
    playCount: video.play_count,
    likeCount: video.like_count,
    commentCount: video.comment_count,
    shareCount: video.share_count,
    collectCount: video.collect_count,
    hashtags: video.hashtags ?? [],
    subtitleText,
    videoR2Url: video.video_file_url ?? undefined,
    coverR2Url: video.cover_url ?? undefined,
  });

  await insertAnalysis({
    video_id: video.id,
    analysis_version: 1,
    model_name: modelName,
    input_summary: buildInputSummary(video, subtitleText),
    video_summary: output.video_summary,
    video_type: output.video_type,
    target_audience: output.target_audience,
    hook_0_3s: output.hook_0_3s,
    storyboard: output.storyboard,
    // ⚠️ voiceover_script 列在 SQL 里是 TEXT,Phase 3 详情页读出来要 JSON.parse
    // (其他列对应 SQL JSONB,supabase-js 自动反序列化,不用 parse)
    voiceover_script: JSON.stringify(output.voiceover_script),
    subtitle_structure: output.subtitle_structure,
    visual_structure: output.visual_structure,
    selling_points: output.selling_points,
    viral_points: output.viral_points,
    replicable_script: output.replicable_script,
    rewrite_suggestions: output.rewrite_suggestions,
  });

  const patch: VideoUpdate = { analysis_status: "completed" };
  await updateVideo(video.id, patch);

  return { nextStatus: "completed", extra: patch };
}

/**
 * 推测旁白:title + description + hashtags
 * 与 extract-subtitle.ts 的降级逻辑保持一致
 */
function assembleSubtitleText(video: VideoRow): string {
  const parts = [video.title, video.description];
  if (video.hashtags && video.hashtags.length > 0) {
    parts.push(video.hashtags.join(" "));
  }
  return parts.filter(Boolean).join(" ").trim();
}

/**
 * 给 analysis_results.input_summary 存一条简短快照,方便日后回溯
 */
function buildInputSummary(video: VideoRow, subtitleText: string): string {
  return JSON.stringify({
    title: video.title,
    description: video.description,
    hashtags: video.hashtags,
    subtitle_excerpt: subtitleText.slice(0, 200),
    video_r2_url: video.video_file_url,
    cover_r2_url: video.cover_url,
  });
}
