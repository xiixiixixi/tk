/**
 * 全局类型定义
 * 整个项目共享的类型放这里;模块特定的类型放各自文件的 types.ts
 */

// ============================================================
// 视频分析状态机(11 个状态)
// 来源:docs/tech.md §2.7 状态机
// ============================================================
export const ANALYSIS_STATUSES = [
  "new", // INSERT 时的初始状态
  "apify_started", // Apify Actor 已启动,等待结果返回
  "metadata_fetched", // 视频元数据已获取
  "video_downloaded", // [DEPRECATED since v0.7]
  "video_processed", // 视频文件已上传到 R2,合并原 download+upload 状态
  "audio_extracted", // 旁白/字幕文本已提取
  "analyzing", // Gemini 正在分析中
  "completed", // 分析完成(终态)
  "failed", // 失败(终态)
  "duplicate", // 重复(终态)
  "pending_analysis", // 等待重新分析
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

// 终态集合(用于前端状态判断和调度器过滤)
export const TERMINAL_STATUSES: ReadonlyArray<AnalysisStatus> = [
  "completed",
  "failed",
  "duplicate",
];

// 等待人工干预的非终态(用于前端 Badge 颜色)
export const ERROR_STATUSES: ReadonlyArray<AnalysisStatus> = ["failed"];

// 视频来源类型
export const SOURCE_TYPES = [
  "manual_video", // 用户手动粘贴链接
  "creator_monitor", // 博主监控抓取
  "keyword_search", // 关键词搜索
  "hashtag_search", // hashtag 搜索
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

// ============================================================
// 任务类型(对应 tasks.task_type)
// ============================================================
export const TASK_TYPES = [
  "analyze_video",
  "monitor_creator",
  "search_keyword",
  "refresh_metrics",
  "reanalyze_video",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "pending", // 待处理
  "processing", // 处理中
  "completed", // 完成
  "failed", // 失败
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

// ============================================================
// Gemini 分析输出(对应 analysis_results 8 大区块)
// 输出 JSON schema 见 docs/tech.md §8.2
// ============================================================
export interface AnalysisHook {
  original: string;
  type: string; // 疑问式/感叹式/反常识/视觉冲击/痛点直击/数据展示/其他
  why_it_works: string;
  replicable_template: string;
}

export interface StoryboardSegment {
  segment: string; // "0-3 秒"
  visual: string;
  audio: string;
  text: string; // 屏幕文字
  purpose: string;
}

export interface VoiceoverScript {
  full_text: string;
  structure: {
    hook: string;
    pain_point: string;
    solution: string;
    proof: string;
    cta: string;
  };
}

export interface SubtitleStructure {
  pain_point: string;
  solution: string;
  proof: string;
  cta: string;
}

export interface VisualStructure {
  character: string;
  product: string;
  scene: string;
  camera: string;
  text_overlay: string;
  pace: string;
}

export interface SellingPoint {
  point: string;
  how_presented: string;
  effectiveness: "高" | "中" | "低";
}

export interface ViralPoint {
  emotional_triggers: string[];
  contrast_points: string[];
  visual_highlights: string[];
  comment_triggers: string[];
  share_reasons: string[];
}

export interface ReplicableScript {
  title_template: string;
  opening: string;
  middle: string;
  ending: string;
  shooting_tips: string[];
}

export interface RewriteSuggestion {
  suitable_industries: string[];
  suitable_products: string[];
  difficulty: "低" | "中" | "高";
  reusability: "低" | "中" | "高";
  notes: string;
}

export interface AnalysisOutput {
  video_summary: string;
  video_type: string; // 教程类/测评类/Vlog类/.../其他
  target_audience: string;
  hook_0_3s: AnalysisHook;
  storyboard: StoryboardSegment[];
  voiceover_script: VoiceoverScript;
  subtitle_structure: SubtitleStructure;
  visual_structure: VisualStructure;
  selling_points: SellingPoint[];
  viral_points: ViralPoint;
  replicable_script: ReplicableScript;
  rewrite_suggestions: RewriteSuggestion;
}

// ============================================================
// Apify TikTok 抓取返回字段(常用子集)
// ============================================================
export interface ApifyTikTokResult {
  id: string; // tiktok video id
  text: string; // 标题/描述
  textLanguage?: string; // 内容语言
  createTime: string; // 数字时间戳或 ISO(Apify 新版 createTimeISO 更稳)
  createTimeISO?: string;
  authorMeta: {
    id: string;
    name: string;
    nickName?: string;
    avatar?: string;
  };
  videoMeta: {
    duration: number; // 秒
    coverUrl?: string;
    downloadUrl?: string; // ⚠️ 新版常为空,改看 mediaUrls
    height?: number;
    width?: number;
    subtitleLinks?: Array<{
      language?: string;
      downloadLink?: string;
      source?: string; // ASR(自动语音识别) | MT(机器翻译)
      sourceUnabbreviated?: string;
    }>;
    transcriptionLink?: string | null;
  };
  webVideoUrl: string;
  diggCount: number; // 点赞
  shareCount: number;
  commentCount: number;
  playCount: number;
  collectCount?: number; // 收藏(顶层,不在 videoMeta)
  repostCount?: number;
  hashtags?: Array<{ name: string }>;
  textExtra?: Array<{ text: string }>; // ⚠️ 新版基本为空,字幕靠 Whisper
  mediaUrls?: string[]; // ⚠️ 视频/图片地址(downloadUrl 为空时用这个)
  submittedVideoUrl?: string; // 备选视频地址
  commentsDatasetUrl?: string; // 评论数据集(本期不用)
  // Apify 失败时返回的字段
  error?: string;
  errorCode?: string;
}

// ============================================================
// 通用工具
// ============================================================
// 视频时长格式化 "1 分 23 秒" / "23 秒"
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} 分` : `${m} 分 ${s} 秒`;
}

// 大数字格式化 "1.2万" / "123.4万" / "1.5亿"
export function formatCount(count: number): string {
  if (count < 10000) return count.toString();
  if (count < 1_0000_0000) return `${(count / 10000).toFixed(1)}万`;
  return `${(count / 1_0000_0000).toFixed(1)}亿`;
}

// AnalysisStatus → 中文标签(对应前端 Badge 显示)
export const STATUS_LABELS: Record<AnalysisStatus, string> = {
  new: "排队中…",
  apify_started: "正在连接 TikTok…",
  metadata_fetched: "正在获取视频数据…",
  video_downloaded: "正在保存视频文件…",
  video_processed: "正在处理视频画面…",
  audio_extracted: "正在提取旁白字幕…",
  analyzing: "AI 正在分析脚本结构…",
  completed: "分析完成",
  failed: "分析失败",
  duplicate: "重复视频",
  pending_analysis: "等待重新分析",
};
