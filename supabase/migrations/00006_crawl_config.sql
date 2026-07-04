-- ============================================================
-- 00006: 全局爬取配置(博主 + 关键词各一套)
-- ============================================================
-- 统一控制所有博主/关键词的采集筛选条件,不逐个配置。
-- scope='creator' 和 scope='keyword' 各一行。
-- 超出 max_age_months 的历史视频由定时清理 cron 删除(每天 0 点)。

CREATE TABLE IF NOT EXISTS crawl_config (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope              TEXT NOT NULL UNIQUE DEFAULT 'creator',  -- 'creator' | 'keyword'
    max_age_months     INTEGER NOT NULL DEFAULT 3,
    exclude_slideshow  BOOLEAN NOT NULL DEFAULT TRUE,
    max_duration_sec   INTEGER NOT NULL DEFAULT 60,
    min_like_count     INTEGER NOT NULL DEFAULT 0,
    min_comment_count  INTEGER NOT NULL DEFAULT 0,
    min_play_count     INTEGER NOT NULL DEFAULT 10000,
    min_share_count    INTEGER NOT NULL DEFAULT 0,
    min_collect_count  INTEGER NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 插入默认行(creator + keyword 各一行,如果不存在)
INSERT INTO crawl_config (scope) VALUES ('creator')
    ON CONFLICT (scope) DO NOTHING;
INSERT INTO crawl_config (scope) VALUES ('keyword')
    ON CONFLICT (scope) DO NOTHING;
