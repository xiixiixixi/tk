-- ============================================================
-- 00003: videos 表补 error_message 列
-- ============================================================
-- 背景:Phase 5 §5.4 技术债 — scheduler catch 异常时把 video 标 failed,
--   但 videos 表没有 error_message 列,失败原因只能记到 tasks 表,
--   前端视频详情页看到 failed 状态却不知道为什么失败。
--
-- 本 migration:
--   1. 给 videos 加 error_message TEXT(可空)
--   2. 成功路径(completed)清空 error_message,失败路径(failed)写入原因
--      (对应 cron/process/route.ts 失败分支)
--
-- 幂等:用 ADD COLUMN IF NOT EXISTS,对已加过列的环境安全。

ALTER TABLE videos
    ADD COLUMN IF NOT EXISTS error_message TEXT;
