-- ============================================================
-- 00007: videos 软删除 + apify_started_at 超时追踪
-- ============================================================
-- 软删除:deleted_at 非空即已删除,默认所有读路径(.is('deleted_at', null))过滤
-- apify_started_at:进入 apify_started 状态时戳,定时任务可据此超时回收

ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_videos_deleted_at ON videos(deleted_at) WHERE deleted_at IS NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS apify_started_at TIMESTAMPTZ NULL;
COMMENT ON COLUMN videos.deleted_at IS '软删除标记,非空即已删除';
COMMENT ON COLUMN videos.apify_started_at IS '进入 apify_started 的时间,用于超时检测';
