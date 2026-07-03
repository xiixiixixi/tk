-- ============================================================
-- TikTok 爆款脚本分析工作台：初始化数据库
-- ============================================================

-- 1. 通用触发器：自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';


-- 2. videos 视频表
CREATE TABLE videos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tiktok_video_id         TEXT,
    original_url            TEXT,
    canonical_url           TEXT,
    author_id               TEXT,
    author_name             TEXT,
    title                   TEXT,
    description             TEXT,
    publish_time            TIMESTAMPTZ,
    duration                INTEGER,
    play_count              INTEGER DEFAULT 0,
    like_count              INTEGER DEFAULT 0,
    comment_count           INTEGER DEFAULT 0,
    share_count             INTEGER DEFAULT 0,
    collect_count           INTEGER DEFAULT 0,
    hashtags                TEXT[],
    cover_url               TEXT,
    video_file_url          TEXT,
    source_type             TEXT NOT NULL DEFAULT 'manual_video',
    source_value            TEXT,
    analysis_status         TEXT NOT NULL DEFAULT 'new',
    apify_run_id            TEXT,
    last_metric_update_time TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 去重约束：同一个 TikTok 视频只存一条
CREATE UNIQUE INDEX idx_videos_tiktok_video_id ON videos(tiktok_video_id);

-- 按状态查询（Process 调度器用）
CREATE INDEX idx_videos_analysis_status ON videos(analysis_status, created_at);

-- 按来源查询
CREATE INDEX idx_videos_source_type ON videos(source_type);

-- 按作者查询（博主监控用）
CREATE INDEX idx_videos_author_id ON videos(author_id);

CREATE TRIGGER trg_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 3. video_assets 资产表
CREATE TABLE video_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    asset_type  TEXT NOT NULL,
    asset_url   TEXT NOT NULL,
    timestamp   INTEGER,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_assets_video_id ON video_assets(video_id);
CREATE INDEX idx_video_assets_type ON video_assets(video_id, asset_type);


-- 4. analysis_results 分析结果表
CREATE TABLE analysis_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id            UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    analysis_version    INTEGER NOT NULL DEFAULT 1,
    model_name          TEXT NOT NULL,
    input_summary       TEXT,
    video_summary       TEXT,
    video_type          TEXT,
    target_audience     TEXT,
    hook_0_3s           JSONB,
    storyboard          JSONB,
    voiceover_script    TEXT,
    subtitle_structure  JSONB,
    visual_structure    JSONB,
    selling_points      JSONB,
    viral_points        JSONB,
    replicable_script   JSONB,
    rewrite_suggestions JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analysis_results_video_id ON analysis_results(video_id, analysis_version DESC);

-- 同一视频同一版本只存一条
CREATE UNIQUE INDEX idx_analysis_results_version ON analysis_results(video_id, analysis_version);


-- 5. creators 博主表
CREATE TABLE creators (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_url       TEXT NOT NULL,
    creator_id        TEXT,
    creator_name      TEXT,
    category          TEXT,
    monitor_frequency TEXT NOT NULL DEFAULT 'daily',
    last_fetch_time   TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_creators_updated_at
    BEFORE UPDATE ON creators
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 6. keywords 关键词表
CREATE TABLE keywords (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword           TEXT NOT NULL,
    region            TEXT DEFAULT 'US',
    language          TEXT DEFAULT 'en',
    fetch_limit       INTEGER DEFAULT 20,
    monitor_frequency TEXT DEFAULT 'daily',
    last_fetch_time   TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_keywords_updated_at
    BEFORE UPDATE ON keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 7. tasks 任务表
CREATE TABLE tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type          TEXT NOT NULL,
    input_value        TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending',
    current_step       TEXT,
    related_video_id   UUID REFERENCES videos(id) ON DELETE SET NULL,
    related_creator_id UUID REFERENCES creators(id) ON DELETE SET NULL,
    related_keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
    error_message      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Process 调度器取待处理任务用
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at);

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
