# TikTok 爆款脚本分析工作台 — 开发任务清单 v0.6

> **本文档是执行计划**(Phase 1–5,每项含文件路径 + 验证标准)。
> **技术事实(选型理由 / 状态机 / API 规格 / Prompt 模板)见 [`docs/tech.md`](./tech.md)**。
> 开发中两文档冲突时,**以本文档为准**(本文档更新频次更高)。
>
> 依赖关系:Phase 1 → Phase 2 → Phase 3 + Phase 4 → Phase 5
>
> Phase 3 和 Phase 4 可并行开发。

---

## Phase 1：项目初始化

### 1.1 Next.js 项目初始化
- [ ] `create-next-app` + TypeScript + Tailwind CSS + App Router
- [ ] shadcn/ui 初始化，按需添加组件（Button, Input, Badge, Table, Card, Tabs, Select, Dialog, Form, Skeleton）
- [ ] 全局布局 `app/layout.tsx`（导航栏 + 页面容器）
- [ ] 全局类型定义 `types/index.ts`

### 1.2 数据库客户端
- [ ] `lib/supabase/client.ts` — 服务端 Supabase 客户端（使用 service_role key）
- [ ] `lib/supabase/browser-client.ts` — 浏览器端 Supabase 客户端（使用 anon key）
- [ ] `lib/supabase/queries.ts` — 常用查询封装
  - (Phase 2 在此加 `getNextPendingVideo()`,见 §2.2 调度器任务)

### 1.3 文件存储客户端
- [ ] `lib/r2/client.ts` — R2 S3 兼容客户端（基于 `@aws-sdk/client-s3`）
- [ ] 封装 `uploadToR2(key, body, contentType)` 和 `getR2PublicUrl(key)`

### 1.4 外部 API 封装（含 Mock）
- [ ] `lib/apify/client.ts` — Apify API 封装（启动 Actor + 轮询结果）
- [ ] `lib/apify/mock.ts` — 模拟 TikTok 数据
- [ ] `lib/gemini/client.ts` — **OpenRouter** API 封装（不是 Google Gemini SDK!走 `https://openrouter.ai/api/v1/chat/completions`,详见 tech.md §3.5 / §8.3）
- [ ] `lib/gemini/prompt.ts` — Prompt 模板（System Prompt + User Prompt,JSON 模板见 tech.md §8.2）
- [ ] `lib/gemini/mock.ts` — 模拟分析结果 JSON

### 1.5 管线类型定义
- [ ] `lib/pipeline/types.ts` — Video, Task, AnalysisResult, Asset 等类型
- [ ] 含 analysis_status 枚举(值见 tech.md §2.7 状态机,11 个状态:`new` / `apify_started` / `metadata_fetched` / `video_downloaded` / `video_processed` / `audio_extracted` / `analyzing` / `completed` / `failed` / `duplicate` / `pending_analysis`)

### 1.6 工具函数
- [ ] `lib/utils.ts` — 通用工具（URL 校验、状态 Label 映射等）

**验证**：`npm run dev` 启动成功，Mock 模式下 lib 各模块导入无报错。

---

## Phase 2：异步管线 API + Handler

### 2.1 任务创建与查询
- [ ] `app/api/tasks/route.ts` — `POST /api/tasks`
  - 校验 input_value
  - INSERT INTO tasks
  - 如果是 analyze_video → INSERT INTO videos（status='new'）
  - 返回 task_id
  - 副作用：`fetch('/api/cron/process')` 启动 HTTP 调用链
- [ ] `app/api/tasks/[id]/route.ts` — `GET /api/tasks/:id`
  - 查询 task + 关联 video
  - 如果是 completed → 附带完整分析结果

### 2.2 核心调度器
- [ ] `supabase/migrations/00002_get_next_pending_video.sql` — SQL function
  - **为什么**: `FOR UPDATE SKIP LOCKED` 必须写在 Postgres 函数里,supabase-js 的 `.from().select()` 不支持
  - 返回 `TABLE (id UUID, analysis_status TEXT, tiktok_video_id TEXT)`
  - 状态过滤:8 个非终态(同 tech.md §6.2,排除 deprecated 的 `video_downloaded`)
  - `ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
- [ ] `lib/supabase/queries.ts` 加 `getNextPendingVideo()` — 用 `supabase.rpc('get_next_pending_video').single()` 调用上面 SQL function
- [ ] `app/api/cron/process/route.ts` — `GET /api/cron/process`
  - 调 `getNextPendingVideo()` 取一个待处理视频
  - 根据 analysis_status 路由到对应 handler
  - 成功 → 推进状态，末尾 `fetch('/api/cron/process')` 接力
  - 失败 → 标记 failed，记录 error_message

### 2.3 Pipeline Handler(v0.7 6 步,R2 video_url 主路径)
- [ ] `lib/pipeline/fetch-metadata.ts` — Step 1a: 启动 Apify Actor(~1s)
- [ ] `lib/pipeline/poll-apify.ts` — Step 1b: 轮询 Apify 结果 + 字幕提取 + 去重(~3s)
- [ ] `lib/pipeline/upload-video-to-r2.ts` — Step 2: 下载 MP4 + 封面 → 立即上传 R2(无 /tmp 中转,~10s,**v0.7 新合并原 Step 2+3**)
- [ ] `lib/pipeline/extract-subtitle.ts` — Step 3: 旁白提取(Apify 字幕优先;**无字幕时检查 env WHISPER_API_KEY**:
  - 已配置 → ASR(OpenAI Whisper),~5s
  - 未配置 → 降级文本拼接(标题+description+hashtags))
- [ ] `lib/pipeline/analyze-gemini.ts` — Step 4: 组装分析包 + 调 Gemini(**v0.7 改传 R2 video_url 完整视频理解,不再抽关键帧**,~8s)
- [ ] 结果写入逻辑在 `analyze-gemini.ts` 末尾(原 Step 6)→ `completed`

### 2.4 视频 CRUD API
- [ ] `app/api/videos/route.ts` — `GET /api/videos`（列表 + 分页 + 筛选）
- [ ] `app/api/videos/[id]/route.ts` — `GET /api/videos/:id`（详情 + assets + analysis）

**验证**:Mock 模式下 `curl -X POST /api/tasks` → 链式自动处理 → status=completed → 数据库有分析结果。

**R2 配置前置**(v0.7 必做):
- Cloudflare R2 bucket `tiktok-assets` 必须开 **Public Access**(Gemini 要 fetch 视频 URL 理解内容)
- 推荐绑定自定义域名(默认 `r2.cloudflarestorage.com` 在某些地区不稳)
- env 字段:`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME=tiktok-assets` / `R2_PUBLIC_URL`(自定义域名或默认域名)

---

## Phase 3：前端页面（核心三页）

### 3.1 全局组件
- [ ] `components/layout/navbar.tsx` — 顶部导航（首页/视频库/博主/关键词/设置）
- [ ] `components/tasks/status-badge.tsx` — 状态 Badge（completed/failed/非终态/duplicate）

### 3.2 首页 `/`
- [ ] `app/page.tsx`
- [ ] `components/tasks/submit-form.tsx` — 三个 Tab（视频链接/博主主页/关键词搜索）+ 输入框 + 提交按钮
- [ ] `components/tasks/task-list.tsx` — 最近任务列表（实时状态 + loading 动画）
- [ ] 前端轮询逻辑（3s 间隔 + 60s 卡住兜底触发 `/api/cron/process`）

### 3.3 视频库 `/videos`
- [ ] `app/videos/page.tsx`
- [ ] `components/videos/video-table.tsx` — 表格（封面/标题/作者/播放/点赞/状态）+ 分页 + 筛选

### 3.4 视频分析详情 `/videos/:id`
- [ ] `app/videos/[id]/page.tsx`
- [ ] `components/videos/analysis-view.tsx` — 8 个区块：
  1. 视频信息卡片
  2. 视频基础判断
  3. 前 3 秒钩子
  4. 分镜结构
  5. 口播/字幕结构
  6. 画面结构
  7. 爆点分析
  8. 可复刻脚本 + 改写方向
- [ ] 非终态时展示对应进度文案 + 轮询

**验证**：Mock 模式提交任务 → 首页看到任务 → 状态自动流转 → 点击进入详情 → 8 个区块完整展示。

---

## Phase 4：博主监控 + 关键词 + 设置

### 4.1 博主监控
- [ ] `app/api/creators/route.ts` — `GET`（列表）+ `POST`（添加）
- [ ] `app/api/creators/[id]/route.ts` — `DELETE`（删除）
- [ ] `app/creators/page.tsx` — 博主卡片列表 + 添加对话框 + "手动抓取"按钮
- [ ] `components/creators/creator-card.tsx`

### 4.2 关键词分析
- [ ] `app/api/keywords/route.ts` — `GET`（列表）+ `POST`（添加）
- [ ] `app/api/keywords/[id]/route.ts` — `DELETE`（删除）
- [ ] `app/keywords/page.tsx` — 关键词卡片列表 + 添加对话框 + "手动搜索"按钮
- [ ] `components/keywords/keyword-card.tsx`

### 4.3 辅助 Cron 端点
- [ ] `app/api/cron/refresh-metrics/route.ts` — 更新互动数据
- [ ] `app/api/cron/monitor-creators/route.ts` — 抓取博主新视频
- [ ] `app/api/cron/search-keywords/route.ts` — 抓取关键词数据

### 4.4 设置页
- [ ] `app/settings/page.tsx`
- [ ] `app/api/settings/route.ts` — `GET`（状态查询）+ `POST`（保存）
- [ ] `components/settings/settings-form.tsx` — API Key 输入 + Mock 状态 + 手动触发按钮

**验证**：添加博主/关键词 → 列表展示 → 手动触发抓取 → 视频入库 → 分析管线处理。

---

## Phase 5：收尾

### 5.1 端到端验证
- [ ] Mock 模式全流程：提交视频 → HTTP 调用链 7 步串联 → completed → 详情展示
- [ ] 前度兜底验证：模拟某步卡住 → 60s 后前端触发兜底 → 链恢复
- [ ] 所有 6 个页面可访问、无报错

### 5.2 部署配置
- [ ] `vercel.json` — Cron 配置（Pro 可选）
- [ ] `.env.local.example` — 环境变量模板（含所有必填项说明）
- [ ] `README.md` — 项目说明 + 本地开发 + 部署步骤

### 5.3 清理
- [ ] 删除测试用临时脚本 `scripts/`
- [ ] 确认 `.gitignore` 包含 `.env.local`
- [ ] 确认 `supabase/migrations/00001_init.sql` 与实际建表一致

---

## 任务依赖图

```
Phase 1（项目初始化）
  │
  ▼
Phase 2（异步管线 API + Handler）
  │
  ├──────┬──────┐
  ▼      ▼      │
Phase 3  Phase 4 │
（前端） （博主+关键词+设置）
  │      │      │
  └──────┴──────┘
         │
         ▼
    Phase 5（收尾）
```

## 文件统计

| Phase | 新增文件数 | 关键产出 |
|-------|----------|---------|
| 1 | ~15 | Next.js 项目 + 5 个 lib 模块 + 类型定义 |
| 2 | ~12 | 7 个 API 端点 + 核心调度器 + 6 个 Handler |
| 3 | ~10 | 3 个页面 + 6 个组件 + 轮询逻辑 |
| 4 | ~10 | 4 个 API 端点 + 3 个页面 + 3 个组件 |
| 5 | ~3 | vercel.json + README + 清理 |
| **合计** | **~50** | |
