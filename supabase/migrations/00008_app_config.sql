-- ============================================================
-- 00008: 应用运行时配置表(app_config)
-- ============================================================
-- 取代 Railway Dashboard 硬编码 cron,让调度逻辑回归应用代码。
-- 设置页可直接修改,无需登录 Railway 后台,即时生效。
--
-- 配置项:
--   schedule_process_interval_min         推进 Pipeline 间隔(分钟)
--   schedule_monitor_creators_interval_min 博主采集间隔(分钟)
--   schedule_search_keywords_interval_min  关键词采集间隔(分钟)
--   schedule_refresh_metrics_interval_min  互动数据刷新间隔(分钟)
--   pipeline_batch_size                    每次 process 取多少个视频
--   pipeline_concurrency                   同时处理几个视频
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_config IS '应用运行时配置,key-value 结构,设置页读写';

-- 默认值(ON CONFLICT 幂等,重复执行安全)
INSERT INTO app_config (key, value) VALUES
    ('schedule_process_interval_min',          '1'),
    ('schedule_monitor_creators_interval_min', '60'),
    ('schedule_search_keywords_interval_min',  '120'),
    ('schedule_refresh_metrics_interval_min',  '1440'),
    ('pipeline_batch_size',                    '5'),
    ('pipeline_concurrency',                   '3')
ON CONFLICT (key) DO NOTHING;
