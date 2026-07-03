-- ============================================================
-- TikTok 爆款脚本分析工作台：原子获取下一条待处理视频
-- ============================================================
-- 用途：
--   /api/cron/process 调度器每步调用此函数,取出一条处于非终态、
--   最久未处理的视频记录,并用 FOR UPDATE SKIP LOCKED 锁住,
--   防止 HTTP 调用链与前端兜底触发并发处理同一条记录。
--
-- 状态来源:tech.md §6.2 (排除 v0.7 deprecated 的 video_downloaded)
-- 调用方式:supabase.rpc('get_next_pending_video')
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_pending_video()
RETURNS TABLE (id UUID, analysis_status TEXT, tiktok_video_id TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    SELECT v.id, v.analysis_status, v.tiktok_video_id
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

COMMENT ON FUNCTION get_next_pending_video() IS
  '原子获取下一条待处理视频(非终态、created_at 最早)并加行锁。'
  'tech.md §6.2 调度器调用,排除 deprecated 的 video_downloaded。'
  'FOR UPDATE SKIP LOCKED 保证并发安全(调用链 + 前端兜底不会重复处理)。';