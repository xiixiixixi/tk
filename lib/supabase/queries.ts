import { getSupabaseAdmin } from "./client";
import type { AnalysisStatus, SourceType } from "@/types";
import type {
  VideoRow,
  VideoInsert,
  VideoUpdate,
  VideoListItem,
  VideoDetail,
  VideoAssetRow,
  VideoAssetInsert,
  AnalysisResultRow,
  AnalysisResultInsert,
  TaskRow,
  TaskInsert,
  CreatorRow,
  CreatorInsert,
  CreatorUpdate,
  CreatorWithStats,
  KeywordRow,
  KeywordInsert,
  KeywordUpdate,
  KeywordWithStats,
  PipelineNextRow,
  VideoAssetInsert as _VideoAssetInsert,
} from "@/lib/pipeline/types";

/**
 * 数据库查询封装
 * 调用方:API routes + Pipeline handlers(服务端)
 * 类型严格 — 不用 Record<string, unknown>
 */

const PAGE_SIZE_DEFAULT = 20;

// ============================================================
// videos 表
// ============================================================

export interface ListVideosParams {
  page?: number;
  pageSize?: number;
  status?: AnalysisStatus;
  sourceType?: SourceType;
  authorId?: string;
  /** 按来源原值过滤(关键词详情页:source_value = keyword) */
  sourceValue?: string;
  /** 标题/作者模糊搜索 */
  search?: string;
  /** 搜索维度:all=标题+作者 / title=仅标题 / author=仅作者 */
  searchType?: "all" | "title" | "author";
  /** 通用列表筛选(每个列表页都有,对应采集筛选的同维度) */
  minPlayCount?: number;
  minLikeCount?: number;
  publishedAfter?: string; // ISO,只显示此时间后发布
  minDurationSec?: number;
  maxDurationSec?: number;
  /** 排序字段 */
  sortBy?: "created_at" | "play_count" | "like_count";
  sortDir?: "asc" | "desc";
}

export interface ListVideosResult {
  videos: VideoListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listVideos(params: ListVideosParams = {}): Promise<ListVideosResult> {
  const {
    page = 1,
    pageSize = PAGE_SIZE_DEFAULT,
    status,
    sourceType,
    authorId,
    sourceValue,
    search,
    searchType,
    minPlayCount,
    minLikeCount,
    publishedAfter,
    minDurationSec,
    maxDurationSec,
    sortBy = "created_at",
    sortDir = "desc",
  } = params;

  let query = getSupabaseAdmin()
    .from("videos")
    .select(
      "id, tiktok_video_id, title, author_id, author_name, cover_url, video_file_url, play_count, like_count, comment_count, analysis_status, source_type, source_value, created_at, updated_at",
      { count: "exact" }
    )
    .order(sortBy, { ascending: sortDir === "asc" });

  if (status) query = query.eq("analysis_status", status);
  if (sourceType) query = query.eq("source_type", sourceType);
  if (authorId) query = query.eq("author_id", authorId);
  if (sourceValue) query = query.eq("source_value", sourceValue);
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`title.ilike.${term},author_name.ilike.${term}`);
  }
  if (minPlayCount != null) query = query.gte("play_count", minPlayCount);
  if (minLikeCount != null) query = query.gte("like_count", minLikeCount);
  if (publishedAfter) query = query.gte("publish_time", publishedAfter);
  if (minDurationSec != null) query = query.gte("duration", minDurationSec);
  if (maxDurationSec != null) query = query.lte("duration", maxDurationSec);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;
  return { videos: (data ?? []) as VideoListItem[], total: count ?? 0, page, pageSize };
}

export async function getVideoById(id: string): Promise<VideoDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("videos")
    .select("*, video_assets(*)")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return (data ?? null) as VideoDetail | null;
}

export async function getVideoByTiktokId(tiktokId: string): Promise<VideoRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("videos")
    .select("*")
    .eq("tiktok_video_id", tiktokId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as VideoRow | null;
}

export async function insertVideo(video: VideoInsert): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("videos")
    .insert(video)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function updateVideo(id: string, patch: VideoUpdate): Promise<void> {
  const { error } = await getSupabaseAdmin().from("videos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateVideoStatus(
  id: string,
  status: AnalysisStatus,
  extra: Partial<VideoUpdate> = {}
): Promise<void> {
  return updateVideo(id, { analysis_status: status, ...extra });
}

// ============================================================
// video_assets 表
// ============================================================

export async function insertVideoAsset(
  videoId: string,
  assetType: VideoAssetInsert["asset_type"],
  assetUrl: string,
  description?: string,
  timestamp?: number
): Promise<void> {
  const asset: VideoAssetInsert = {
    video_id: videoId,
    asset_type: assetType,
    asset_url: assetUrl,
    description: description ?? null,
    timestamp: timestamp ?? null,
  };
  const { error } = await getSupabaseAdmin().from("video_assets").insert(asset);
  if (error) throw error;
}

export async function listVideoAssets(videoId: string): Promise<VideoAssetRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("video_assets")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VideoAssetRow[];
}

// ============================================================
// analysis_results 表
// ============================================================

export async function getLatestAnalysis(videoId: string): Promise<AnalysisResultRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("analysis_results")
    .select("*")
    .eq("video_id", videoId)
    .order("analysis_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as AnalysisResultRow | null;
}

export async function insertAnalysis(result: AnalysisResultInsert): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("analysis_results")
    .insert(result)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

// ============================================================
// tasks 表
// ============================================================

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data ?? null) as TaskRow | null;
}

export async function insertTask(task: TaskInsert): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .insert(task)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function updateTask(
  id: string,
  patch: Partial<TaskInsert> & { status?: string; current_step?: string | null; error_message?: string | null }
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

// ============================================================
// Phase 2 调度器(get_next_pending_video RPC)
// ============================================================
export async function getNextPendingVideo(): Promise<PipelineNextRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .rpc("get_next_pending_video")
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return (data ?? null) as PipelineNextRow | null;
}

// ============================================================
// creators / keywords 监控目标
// ============================================================

export async function listCreators(): Promise<CreatorRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("creators")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CreatorRow[];
}

/** 博主列表 + 每个博主按 author_id 实时统计(视频总数 / 已解析数) */
export async function listCreatorsWithStats(): Promise<CreatorWithStats[]> {
  const creators = await listCreators();
  return Promise.all(
    creators.map(async (c) => {
      const stats = await getCreatorVideoStats(c.creator_id);
      return { ...c, ...stats };
    })
  );
}

export async function getCreatorById(id: string): Promise<CreatorRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("creators")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as CreatorRow | null;
}

/** 按 author_id 统计视频总数 + 已解析数(D5:不按 source_type,避免漏关键词入口采到的同作者视频) */
export async function getCreatorVideoStats(
  authorId: string | null
): Promise<{ video_count: number; analyzed_count: number }> {
  if (!authorId) return { video_count: 0, analyzed_count: 0 };
  const admin = getSupabaseAdmin();
  const [{ count: total }, { count: analyzed }] = await Promise.all([
    admin.from("videos").select("id", { count: "exact", head: true }).eq("author_id", authorId),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("author_id", authorId)
      .eq("analysis_status", "completed"),
  ]);
  return { video_count: total ?? 0, analyzed_count: analyzed ?? 0 };
}

export async function insertCreator(creator: CreatorInsert): Promise<void> {
  const { error } = await getSupabaseAdmin().from("creators").insert(creator);
  if (error) throw error;
}

export async function updateCreator(id: string, patch: CreatorUpdate): Promise<void> {
  const { error } = await getSupabaseAdmin().from("creators").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCreator(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("creators").delete().eq("id", id);
  if (error) throw error;
}

export async function listKeywords(): Promise<KeywordRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("keywords")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as KeywordRow[];
}

/** 关键词列表 + 采集统计(按 source_value = keyword 文本) */
export async function listKeywordsWithStats(): Promise<KeywordWithStats[]> {
  const keywords = await listKeywords();
  return Promise.all(
    keywords.map(async (k) => {
      const stats = await getKeywordVideoStats(k.keyword);
      return { ...k, ...stats };
    })
  );
}

export async function getKeywordById(id: string): Promise<KeywordRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("keywords")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as KeywordRow | null;
}

/** 按 source_value(=keyword)统计该关键词采集到的视频数 + 已解析数 */
export async function getKeywordVideoStats(
  keyword: string
): Promise<{ video_count: number; analyzed_count: number }> {
  const admin = getSupabaseAdmin();
  const [{ count: total }, { count: analyzed }] = await Promise.all([
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "keyword_search")
      .eq("source_value", keyword),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "keyword_search")
      .eq("source_value", keyword)
      .eq("analysis_status", "completed"),
  ]);
  return { video_count: total ?? 0, analyzed_count: analyzed ?? 0 };
}

export async function insertKeyword(keyword: KeywordInsert): Promise<void> {
  const { error } = await getSupabaseAdmin().from("keywords").insert(keyword);
  if (error) throw error;
}

export async function updateKeyword(id: string, patch: KeywordUpdate): Promise<void> {
  const { error } = await getSupabaseAdmin().from("keywords").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteKeyword(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("keywords").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// 首页汇总仪表盘统计
// ============================================================

export interface DashboardStats {
  creator_count: number;
  keyword_count: number;
  video_total: number;
  new_today: number; // 24h 内入库
  pending_analysis: number; // 非终态(处理中)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const terminal = ["completed", "failed", "duplicate"];
  const [creators, keywords, videoTotal, newToday, pending] = await Promise.all([
    admin.from("creators").select("id", { count: "exact", head: true }),
    admin.from("keywords").select("id", { count: "exact", head: true }),
    admin.from("videos").select("id", { count: "exact", head: true }),
    admin.from("videos").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .not("analysis_status", "in", `(${terminal.join(",")})`),
  ]);
  return {
    creator_count: creators.count ?? 0,
    keyword_count: keywords.count ?? 0,
    video_total: videoTotal.count ?? 0,
    new_today: newToday.count ?? 0,
    pending_analysis: pending.count ?? 0,
  };
}
