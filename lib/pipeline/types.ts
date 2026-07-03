/**
 * Pipeline 模块的 DB 行类型 + 输入/更新类型
 *
 * 字段名严格对齐 supabase/migrations/00001_init.sql 的列定义
 * 时间字段是 TIMESTAMPTZ,从 DB 取出是 ISO string
 *
 * 这文件专门给 Pipeline handler + lib/supabase/queries.ts 用
 * (前端展示用类型在 types/index.ts)
 */

// ============================================================
// SELECT 行类型(从 DB 读出来的完整行,字段对应 SQL 表列)
// ============================================================

export interface VideoRow {
  id: string;
  tiktok_video_id: string | null;
  original_url: string | null;
  canonical_url: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string | null;
  description: string | null;
  publish_time: string | null;
  duration: number | null;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  hashtags: string[] | null;
  cover_url: string | null;
  video_file_url: string | null;
  source_type: string;
  source_value: string | null;
  analysis_status: string;
  apify_run_id: string | null;
  last_metric_update_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoAssetRow {
  id: string;
  video_id: string;
  asset_type: "mp4" | "cover" | "frame" | "audio" | "subtitle";
  asset_url: string;
  timestamp: number | null;
  description: string | null;
  created_at: string;
}

export interface AnalysisResultRow {
  id: string;
  video_id: string;
  analysis_version: number;
  model_name: string;
  input_summary: string | null;
  // JSONB 字段 → 结构化 JSON(从 SUPABASE 取出来还是 string,需要 .from(...) select 自动解析;这里用 unknown 更准确)
  video_summary: string | null;
  video_type: string | null;
  target_audience: string | null;
  hook_0_3s: unknown;
  storyboard: unknown;
  voiceover_script: string | null;
  subtitle_structure: unknown;
  visual_structure: unknown;
  selling_points: unknown;
  viral_points: unknown;
  replicable_script: unknown;
  rewrite_suggestions: unknown;
  created_at: string;
}

export interface CreatorRow {
  id: string;
  creator_url: string;
  creator_id: string | null;
  creator_name: string | null;
  category: string | null;
  monitor_frequency: string;
  last_fetch_time: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface KeywordRow {
  id: string;
  keyword: string;
  region: string;
  language: string;
  fetch_limit: number;
  monitor_frequency: string;
  last_fetch_time: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  task_type: string;
  input_value: string;
  status: string;
  current_step: string | null;
  related_video_id: string | null;
  related_creator_id: string | null;
  related_keyword_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// INSERT 类型(插入新行,必填 + 可选拆开)
// 跟 SQL DEFAULT 配合,只有必填字段才需要传
// ============================================================

export type VideoInsert = {
  // 必填(代码层强制)
  source_type: string;
  // 可选(可在调用时补)
  source_value?: string | null; // 原始输入(URL / keyword / creator_url 等)
  tiktok_video_id?: string | null;
  original_url?: string | null;
  canonical_url?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  title?: string | null;
  description?: string | null;
  publish_time?: string | null;
  duration?: number | null;
  // 互动指标 — mock 模式下入库时填,真实 Apify 后续 fetch
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  collect_count?: number;
  hashtags?: string[] | null;
  cover_url?: string | null;
  apify_run_id?: string | null;
};

export type VideoUpdate = Partial<Omit<VideoInsert, "source_type">> & {
  analysis_status?: string;
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  collect_count?: number;
  video_file_url?: string | null;
  last_metric_update_time?: string | null;
};

export type VideoAssetInsert = {
  video_id: string;
  asset_type: VideoAssetRow["asset_type"];
  asset_url: string;
  timestamp?: number | null;
  description?: string | null;
};

export type AnalysisResultInsert = {
  video_id: string;
  analysis_version: number;
  model_name: string;
  input_summary?: string | null;
  video_summary?: string | null;
  video_type?: string | null;
  target_audience?: string | null;
  hook_0_3s?: unknown;
  storyboard?: unknown;
  voiceover_script?: string | null;
  subtitle_structure?: unknown;
  visual_structure?: unknown;
  selling_points?: unknown;
  viral_points?: unknown;
  replicable_script?: unknown;
  rewrite_suggestions?: unknown;
};

export type TaskInsert = {
  task_type: string;
  input_value: string;
  related_video_id?: string | null;
  related_creator_id?: string | null;
  related_keyword_id?: string | null;
  current_step?: string | null;
};

export type CreatorInsert = {
  creator_url: string;
  creator_id?: string | null;
  creator_name?: string | null;
  category?: string | null;
  monitor_frequency?: string;
};

export type KeywordInsert = {
  keyword: string;
  region?: string;
  language?: string;
  fetch_limit?: number;
  monitor_frequency?: string;
};

// ============================================================
// 联合类型(查询返回的视频库 + 详情)
// ============================================================

/** 视频库列表每行(SELECT 时只选必要列,不暴露原始 URL 等敏感字段) */
export interface VideoListItem {
  id: string;
  tiktok_video_id: string | null;
  title: string | null;
  author_id: string | null;
  author_name: string | null;
  cover_url: string | null;
  video_file_url: string | null;
  play_count: number;
  like_count: number;
  comment_count: number;
  analysis_status: string;
  source_type: string;
  source_value: string | null;
  created_at: string;
  updated_at: string;
}

/** 视频详情:VideoRow + 所有 assets */
export interface VideoDetail extends VideoRow {
  video_assets: VideoAssetRow[];
}

/** 视频详情:VideoRow + 最新一条 analysis_result */
export interface VideoWithLatestAnalysis extends VideoDetail {
  latest_analysis: AnalysisResultRow | null;
}

/** get_next_pending_video RPC 返回的单行(调度器下一条待处理视频) */
export interface PipelineNextRow {
  id: string;
  analysis_status: string;
  tiktok_video_id: string | null;
}
