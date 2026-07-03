-- ============================================================
-- 00002: 核心调度器依赖的 RPC — get_next_pending_video
-- ============================================================
-- 取下一条待处理视频,用 FOR UPDATE SKIP LOCKED 防并发重复处理。
--
-- 调用方:lib/supabase/queries.ts → getNextPendingVideo()
--         app/api/cron/process/route.ts 调度器每轮取一条
--
-- 待处理状态集合(对应 docs/tech.md §2.7 状态机):
--   new / apify_started / metadata_fetched /
--   video_processed / audio_extracted / analyzing / pending_analysis
-- (video_downloaded 自 v0.7 起废弃,不在此列)
--
-- 返回:id / analysis_status / tiktok_video_id(供调度器路由 handler)
--
-- 幂等:CREATE OR REPLACE,对已存在该 RPC 的环境(如手动建过)安全。

CREATE OR REPLACE FUNCTION get_next_pending_video()
RETURNS TABLE (
    id UUID,
    analysis_status TEXT,
    tiktok_video_id TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.analysis_status,
        v.tiktok_video_id
    FROM videos v
    WHERE v.analysis_status IN (
        'new',
        'apify_started',
        'metadata_fetched',
        'video_processed',
        'audio_extracted',
        'analyzing',
        'pending_analysis'
    )
    ORDER BY v.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
END;
$$;
