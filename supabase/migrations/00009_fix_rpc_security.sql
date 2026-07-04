-- ============================================================
-- 00009: RPC 函数加 SECURITY DEFINER,修复 anon key 调用失败
-- ============================================================
-- 背景:get_next_pending_video 使用 FOR UPDATE SKIP LOCKED
-- 需要写权限。如果调用方使用 anon key(RLS 只读),RPC 会返回
-- "permission denied for table videos",导致 process handler
-- 一直返回 no pending tasks,视频全部卡住或标 failed。
--
-- 解决:加 SECURITY DEFINER,让函数以创建者(postgres)的权限运行,
-- 完全绕过调用方的 RLS 限制。函数内部已经通过 WHERE 条件限制了
-- 返回范围,不存在越权问题。
-- ============================================================

DROP FUNCTION IF EXISTS get_next_pending_video();

CREATE OR REPLACE FUNCTION get_next_pending_video()
RETURNS TABLE (id UUID, analysis_status TEXT, tiktok_video_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  '原子获取下一条待处理视频(SECURITY DEFINER,绕过 RLS 写限制)。';
