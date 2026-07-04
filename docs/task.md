# TikTok 爆款脚本分析工作台 — 开发任务清单 v0.8

> **本文档是执行计划**(Phase 1–6,每项含文件路径 + 验证标准)。
> **技术事实(选型理由 / 状态机 / API 规格 / Prompt 模板)见 [`docs/tech.md`](./tech.md)**。
> **全服务部署指南见 [`docs/deployment.md`](./deployment.md)**。
> 开发中两文档冲突时,**以本文档为准**(本文档更新频次更高)。
>
> 依赖关系:Phase 1 → Phase 2 → Phase 3 + Phase 4 → Phase 5 → Phase 6(生产化)

---

## Phase 1：项目初始化 ✅

### 1.1 Next.js 项目初始化
- [x] `create-next-app` + TypeScript + Tailwind CSS + App Router
- [x] shadcn/ui 初始化,组件已加(Button, Input, Badge, Table, Card, Tabs, Select, Dialog, Form, Skeleton + 自定义 empty-state/loading-state/typography)
- [x] 全局布局 `app/layout.tsx`(导航栏 + 页面容器)
- [x] 全局类型定义 `types/index.ts`(含 11 状态机 + AnalysisOutput 8 区块 + ApifyTikTokResult 真实字段)

### 1.2 数据库客户端
- [x] `lib/supabase/client.ts` — 服务端 client(service_role key,单例)
- [x] `lib/supabase/browser-client.ts` — 浏览器端 client(anon key)
- [x] `lib/supabase/queries.ts` — 全表 CRUD + 分页 + `getNextPendingVideo()`(RPC)

### 1.3 文件存储客户端
- [x] `lib/r2/client.ts` — `uploadToR2` / `getR2PublicUrl` / `getR2PresignedUrl`(v0.8 修正 .r2.dev URL 不含 bucket 名)

### 1.4 外部 API 封装
- [x] `lib/apify/client.ts` — v0.8 修正字段名(`postURLs`/`profiles`/`searchQueries`)+ 三种抓取模式 + `getRunDataset`(走 datasets endpoint)
- [x] `lib/apify/mock.ts` — 模拟 TikTok 数据
- [x] `lib/apify/mapper.ts` — Apify → VideoUpdate 字段映射(`createTimeISO`/`extractVideoDownloadUrl`/`extractCoverUrl`)
- [x] `lib/gemini/client.ts` — OpenRouter 封装,视频走 base64 内联,gemini-3.5-flash
- [x] `lib/gemini/prompt.ts` — System Prompt + User Prompt(JSON schema)
- [x] `lib/gemini/mock.ts` — 模拟分析结果

### 1.5 管线类型定义
- [x] `lib/pipeline/types.ts` — VideoRow/TaskRow/AnalysisResultRow/VideoAssetRow + Insert/Update 类型

### 1.6 工具函数
- [x] `lib/utils.ts` — `cn` + `isValidTikTokUrl` + `extractTikTokVideoId` + `classifyTikTokUrl`

**验证**：✅ `npm run dev` 启动成功,Mock 模式下 lib 各模块导入无报错

---

## Phase 2：异步管线 API + Handler ✅

### 2.1 任务创建与查询
- [x] `app/api/tasks/route.ts` — `POST /api/tasks`(校验 + INSERT tasks/videos + fire-and-forget 触发链)
- [x] `app/api/tasks/[id]/route.ts` — `GET /api/tasks/:id`(task + video + latest_analysis)

### 2.2 核心调度器
- [x] `supabase/migrations/00002_get_next_pending_video.sql` — RPC 函数(`FOR UPDATE SKIP LOCKED`)
- [x] `lib/supabase/queries.ts` 的 `getNextPendingVideo()` — `.rpc('get_next_pending_video')`
- [x] `app/api/cron/process/route.ts` — 取待处理视频 → 路由 handler → 推进/失败 → 接力 + task 状态同步

### 2.3 Pipeline Handler(v0.8 真实化)
- [x] `lib/pipeline/fetch-metadata.ts` — Step 1a: 启动 Apify(`postURLs`)/ Mock 跳过
- [x] `lib/pipeline/poll-apify.ts` — Step 1b: 轮询 Apify + 字幕 + 真实 `tiktok_video_id` 去重
- [x] `lib/pipeline/upload-video-to-r2.ts` — Step 2: v0.8 改为调 **Railway Worker**(yt-dlp 下载)→ R2;封面独立处理
- [x] `lib/pipeline/extract-subtitle.ts` — Step 3: Apify 字幕(`subtitleLinks` WEBVTT)优先 → 文本降级(v0.8 移除 Whisper,Gemini 自身听音频兜底)
- [x] `lib/pipeline/analyze-gemini.ts` — Step 4: 视频 base64 内联 + 读 video_assets 字幕 → Gemini 分析 → INSERT analysis_results → completed

### 2.4 视频 CRUD API
- [x] `app/api/videos/route.ts` — `GET /api/videos`(分页 + status/sourceType 筛选 + 参数校验)
- [x] `app/api/videos/[id]/route.ts` — `GET /api/videos/:id`(详情 + assets + analysis)

**验证**：✅ 真实模式 `POST /api/tasks` → Apify → Railway Worker 下视频 → R2 → Gemini 视频画面+音频分析 → completed

---

## Phase 3：前端页面(核心三页)✅

### 3.1 全局组件
- [x] `components/layout/navbar.tsx` — 顶部导航(首页/视频库/博主/关键词/设置)
- [x] `components/tasks/status-badge.tsx` — 状态 Badge(cva variant: success/error/warning/processing)

### 3.2 首页 `/`
- [x] `app/page.tsx` — Editorial 杂志风
- [x] `components/tasks/submit-form.tsx` — 三个 Tab + 客户端 URL 校验 + window 事件通知
- [x] `components/tasks/task-list.tsx` — 最近任务列表(Supabase browser client)
- [x] 前端轮询逻辑(详情页 3s + 60s 兜底;列表页 5s 含非终态时才轮询)

### 3.3 视频库 `/videos`
- [x] `app/videos/page.tsx` — SSR 首屏
- [x] `components/videos/video-table.tsx` — 表格 + 分页 + status 筛选 + URL 同步 + 轮询

### 3.4 视频分析详情 `/videos/:id`
- [x] `app/videos/[id]/page.tsx` — 终态/非终态分支
- [x] `components/videos/analysis-view.tsx` — 8 区块(信息卡/基础判断/钩子/分镜/口播/画面/爆点/复刻脚本)+ stagger 动画
- [x] `components/videos/pending-analysis-panel.tsx` — 非终态轮询 + failed/duplicate 友好提示

**验证**：✅ 真实模式提交 → 首页任务 → 状态流转 → 详情 8 区块完整展示

---

## Phase 4：博主监控 + 关键词 + 设置 ✅

### 4.1 博主监控
- [x] `app/api/creators/route.ts` — GET + POST(creator_url 正则校验)
- [x] `app/api/creators/[id]/route.ts` — DELETE(UUID 校验 + 先查再删)
- [x] `app/creators/page.tsx` + `components/creators/creator-card.tsx` — 卡片列表 + 添加 dialog + 立即抓取(走 cron)

### 4.2 关键词分析
- [x] `app/api/keywords/route.ts` — GET + POST(keyword 长度 + fetch_limit 范围校验)
- [x] `app/api/keywords/[id]/route.ts` — DELETE
- [x] `app/keywords/page.tsx` + `components/keywords/keyword-card.tsx`
- [x] 共享 `components/monitor/form-dialog.tsx` + `utils.ts`(react-hook-form + zod)

### 4.3 辅助 Cron 端点(v0.8 接真实 Apify)
- [x] `app/api/cron/refresh-metrics/route.ts` — 重抓 completed 视频互动数(限 5 条/次控成本)
- [x] `app/api/cron/monitor-creators/route.ts` — `profiles` 抓取 + 真实 tiktok_id 去重 + 触发 pipeline
- [x] `app/api/cron/search-keywords/route.ts` — `searchQueries` 抓取 + 去重 + 触发 pipeline

### 4.4 设置页
- [x] `app/settings/page.tsx` + `app/api/settings/route.ts`(GET 状态 + POST 触发 cron)
- [x] `components/settings/settings-form.tsx` — secret masking + Mock 状态 + 4 个手动触发(慢端点 fire-and-forget)+ 测试提交

**验证**：✅ 添加博主/关键词 → 列表展示 → 立即抓取 → 视频入库 → 分析管线处理

---

## Phase 5：收尾 ✅

### 5.1 端到端验证
- [x] 真实全流程跑通:Apify → Railway Worker 下视频 → R2 → Gemini 视频画面+音频分析 → completed
- [x] 链断裂兜底:60s 触发 `/api/cron/process`
- [x] 6 页面 + 13 API + 4 cron 全部 200
- [x] `tasks.status` 同步(`syncTaskStatus`)+ `videos.error_message` 写入失败原因
- [x] 边界测试 8 场景:非法 task_type / 不存在 ID / 非法 status / URL / fetch_limit 越界 等全对

### 5.2 部署配置
- [x] `docs/deployment.md` — Railway 全服务部署文档(web + worker + Supabase + R2 + 迁移 checklist)
- [x] `.env.local.example` — 全字段(Supabase/Apify/R2/OpenRouter/Railway Worker,已移除 Whisper)
- [x] `README.md` — 重写(完成度表 + 本地开发 + 部署 + 已知限制)
- [x] `docs/tech.md` §16 已知 stub 表 + §17 v0.8 版本记录
- [x] `docs/deployment.md` — 全服务部署文档(web + worker + Supabase + R2 + 迁移 checklist)

### 5.3 代码清理
- [x] 删重复 migration(`00002_scheduler_rpc.sql`)
- [x] 删探测脚本 `scripts/verify-r2-presigned.js`
- [x] `.gitignore` 补 `supabase/.temp/` + `git rm --cached` 8 个 CLI 缓存
- [x] 移除 Whisper(`lib/whisper/` + WHISPER_API_KEY 引用)

### 5.4 数据库一致性
- [x] `get_next_pending_video` RPC 在 migration + 远程可用
- [x] `00003_videos_error_message.sql` — videos 加 error_message 列 + 调度器写入

---

## Phase 6：生产化(未完成)

> 以下是从"能跑的正式版"到"敢放公网让别人用"还需要做的事。优先级从高到低。

### 6.1 安全加固 ✅
- [x] **Supabase RLS 策略** — 6 张表开 RLS,anon 只读展示数据(videos/assets/analysis),敏感表(tasks/creators/keywords)全禁;REVOKE 写权限双保险;service_role 绕过(00004_rls_policies.sql,实测 anon 写删全 401)
- [x] **cron 端点鉴权** — 4 个 cron 加 `requireCronAuth`,放行规则:X-Cron-Secret / 同源 / 开发环境;内部调用全带 secret
- [x] **前端不再裸查 DB** — task-list 改走 `GET /api/tasks`(service_role 查),不再用 anon 直查
- [ ] **API 限流** — 同 IP 短时间多次请求拒绝(防刷),可用 Upstash Ratelimit(可选,单人自用不急)

### 6.2 健壮性 🟠 重要
- [ ] **handler 失败重试** — 当前抛错直接 failed,无重试。加指数退避(最多 3 次),Apify RUNNING / 网络抖动可自动恢复
- [ ] **结构化日志** — 当前只有 console.log,加 pino + 错误上报(Sentry),生产可观测
- [ ] **成本控制** — Gemini 月度预算上限(超限拒绝调用);设置页手动触发防抖

### 6.3 测试 🟡 建议
- [ ] 核心 handler 单元测试(fetch-metadata / poll-apify / extract-subtitle / analyze-gemini)
- [ ] WEBVTT 解析测试(`parseWebVtt` 各种格式)
- [ ] API 端点集成测试(任务创建/查询/视频 CRUD)

### 6.4 产品完整度 ⚪ 可选
- [ ] 重新分析功能(前端入口 + `pending_analysis` 状态 handler 已有,差 UI)
- [ ] 分析结果导出(JSON / PDF)
- [ ] 多用户系统(Supabase Auth + per-user RLS + 配额)— 当前单人自用

### 6.5 已知限制(不阻塞,登记在案)
- [ ] slideshow 视频(`isSlideshow:true`)无 mp4,worker 下不到 → 走封面+字幕降级
- [ ] 长视频(>25MB)base64 超 Gemini token 上限 → 跳过视频走封面降级
- [ ] Railway Worker 同步等待,长视频可能撞 Gemini base64 token 上限 → 已有降级,但理想方案是改异步(jobId 轮询)

---

## 任务依赖图

```
Phase 1（项目初始化）✅
  │
  ▼
Phase 2（异步管线 API + Handler）✅
  │
  ├──────┬──────┐
  ▼      ▼      │
Phase 3  Phase 4 │  ✅    ✅
（前端）（博主+关键词+设置）
  │      │      │
  └──────┴──────┘
         │
         ▼
    Phase 5（收尾）✅
         │
         ▼
    Phase 6（生产化）⬜ ← 当前阶段
```

## 文件统计(实际)

| Phase | 文件 | 状态 |
|-------|------|------|
| 1 | lib/(supabase/r2/apify/gemini/pipeline) + types + utils | ✅ |
| 2 | 7 API + 调度器 + 6 Handler + worker client | ✅ |
| 3 | 3 页面 + 8 组件 + 轮询 | ✅ |
| 4 | 6 API + 3 页面 + monitor 共享组件 | ✅ |
| 5 | deployment.md + README + 4 migration + 文档 + 清理 | ✅ |
| Railway | worker/(server.js + Dockerfile + package.json) | ✅ 已部署 |
| **合计** | ~55 文件 | Phase 1-5 完成 |
