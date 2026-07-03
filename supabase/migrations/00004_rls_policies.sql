-- ============================================================
-- 00004: RLS(行级安全)策略 — Phase 6 安全加固
-- ============================================================
-- 目的:堵住"前端 anon key 裸奔"漏洞。
--
-- 现状:6 张表 RLS 全关,任何人拿到 anon key(前端硬编码可见)就能任意读写删。
--
-- 策略(单人自用版):
--   - service_role key(服务端 lib/supabase/client.ts):绕过 RLS,全部可读写
--   - anon key(前端 lib/supabase/browser-client.ts):
--       videos        → 只读(列表/详情展示需要)
--       video_assets  → 只读(详情页展示需要)
--       analysis_results → 只读(详情页展示需要)
--       tasks         → 禁止(改走 /api/tasks GET,不直接查表)
--       creators      → 禁止(改走 /api/creators)
--       keywords      → 禁止(改走 /api/keywords)
--   - 所有写操作(INSERT/UPDATE/DELETE):仅 service_role,anon 全禁
--
-- 多用户版上线时,改成 per-user RLS(加 user_id 列 + auth.uid() 过滤)。
-- ============================================================

-- 1. 开启 RLS(6 张表)
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;

-- 2. 只读策略(anon + service_role 都能读;写操作被 RLS 拦)
--    单人自用:anon 只读展示用数据,敏感表(tasks/creators/keywords)完全禁 anon

-- videos:anon 只读(列表/详情)
DROP POLICY IF EXISTS "videos anon select" ON videos;
CREATE POLICY "videos anon select" ON videos
    FOR SELECT TO anon USING (true);

-- video_assets:anon 只读(详情页展示 assets)
DROP POLICY IF EXISTS "video_assets anon select" ON video_assets;
CREATE POLICY "video_assets anon select" ON video_assets
    FOR SELECT TO anon USING (true);

-- analysis_results:anon 只读(详情页展示分析结果)
DROP POLICY IF EXISTS "analysis_results anon select" ON analysis_results;
CREATE POLICY "analysis_results anon select" ON analysis_results
    FOR SELECT TO anon USING (true);

-- tasks / creators / keywords:不给 anon 任何 policy = anon 完全无权限
-- (前端改走 API,API 用 service_role 查)

-- 3. service_role 自动绕过 RLS(Postgres 默认行为,service_role 属于 bypassrls)
--    不需要额外写 policy。

-- 4. 收紧 anon/anon 角色的表权限(双保险)
--    Supabase 默认给 anon 角色 GRANT ALL,即使开了 RLS,某些场景(如 FORCE 未开)仍可能绕过。
--    直接 REVOKE 写权限,从权限层面彻底堵死:anon 只能 SELECT 展示用数据,不能写。
--    tasks/creators/keywords 连 SELECT 也 REVOKE(前端改走 API,不直查这些表)。

-- videos / video_assets / analysis_results:anon 只保留 SELECT
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON videos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON video_assets FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON analysis_results FROM anon;

-- tasks / creators / keywords:anon 全部权限移除(包括 SELECT)
REVOKE ALL ON tasks FROM anon;
REVOKE ALL ON creators FROM anon;
REVOKE ALL ON keywords FROM anon;

-- 同样收紧 authenticated(本期无用户系统,authenticated 也不该直接访问)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON videos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON video_assets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON analysis_results FROM authenticated;
REVOKE ALL ON tasks FROM authenticated;
REVOKE ALL ON creators FROM authenticated;
REVOKE ALL ON keywords FROM authenticated;
