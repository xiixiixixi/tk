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
  KeywordRow,
  KeywordInsert,
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
}

export interface ListVideosResult {
  videos: VideoListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listVideos(params: ListVideosParams = {}): Promise<ListVideosResult> {
  const { page = 1, pageSize = PAGE_SIZE_DEFAULT, status, sourceType, authorId } = params;

  let query = getSupabaseAdmin()
    .from("videos")
    .select(
      "id, tiktok_video_id, title, author_id, author_name, cover_url, video_file_url, play_count, like_count, comment_count, analysis_status, source_type, source_value, created_at, updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("analysis_status", status);
  if (sourceType) query = query.eq("source_type", sourceType);
  if (authorId) query = query.eq("author_id", authorId);

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
// Phase 2 调度器占位(getNextPendingVideo 推迟到 §2.2 见 task.md)
// ============================================================
export async function getNextPendingVideo(): Promise<{
  id: string;
  analysis_status: string;
  tiktok_video_id: string | null;
} | null> {
  // TODO Phase 2:实现 supabase/migration/00002_get_next_pending_video.sql + .rpc()
  // 等 SQL function 落地后,把 .rpc('get_next_pending_video').single() 接上
  throw new Error("getNextPendingVideo 未实现 — 见 task.md §2.2");
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

export async function insertCreator(creator: CreatorInsert): Promise<void> {
  const { error } = await getSupabaseAdmin().from("creators").insert(creator);
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

export async function insertKeyword(keyword: KeywordInsert): Promise<void> {
  const { error } = await getSupabaseAdmin().from("keywords").insert(keyword);
  if (error) throw error;
}

export async function deleteKeyword(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("keywords").delete().eq("id", id);
  if (error) throw error;
}
