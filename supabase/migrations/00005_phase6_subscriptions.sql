-- ============================================================
-- 00005: Phase 6 产品化重构 — 订阅统计 + 关键词采集筛选条件
-- ============================================================
-- 背景:把"手动触发的任务跟踪"升级为"自动采集的订阅系统"。
--   - creators:记录上次采集新增数(卡片展示用;总数按 author_id 实时 count,不落库避免漂移)
--   - keywords:加一组采集筛选条件(订阅时设,采集时应用,入库前过滤省解析成本)
-- 决策依据见 docs/task.md §6.0.1(D1–D7)。
-- ============================================================

-- 1. creators:上次采集新增视频数(每轮 cron 写入,卡片展示"新增 X 条")
--    注:该博主视频总数 / 已解析数按 videos.author_id 实时 count(D5),不落库。
ALTER TABLE creators
    ADD COLUMN IF NOT EXISTS last_fetch_video_count INTEGER NOT NULL DEFAULT 0;

-- 2. keywords:采集筛选条件(全部可空 = 不限制该维度)
ALTER TABLE keywords
    ADD COLUMN IF NOT EXISTS min_play_count      INTEGER,
    ADD COLUMN IF NOT EXISTS min_like_count      INTEGER,
    ADD COLUMN IF NOT EXISTS min_engagement_rate NUMERIC,   -- like/play,如 0.05 = 5%
    ADD COLUMN IF NOT EXISTS published_after     TIMESTAMPTZ, -- 只采此时间后发布的
    ADD COLUMN IF NOT EXISTS min_duration_sec    INTEGER,
    ADD COLUMN IF NOT EXISTS max_duration_sec    INTEGER,
    ADD COLUMN IF NOT EXISTS unwanted_hashtags   TEXT[],
    ADD COLUMN IF NOT EXISTS exclude_slideshow   BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. 按作者查视频(博主详情页下钻,D5)已有 idx_videos_author_id,无需新增。
--    统一视频库按 created_at 倒序 + status/source 过滤已有索引覆盖。
