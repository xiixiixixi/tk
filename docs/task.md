# TikTok 爆款脚本分析工作台 — 开发任务清单 v1.0

> **本文档是执行计划**(Phase 1–6,每项含文件路径 + 验证标准)。
> **技术事实(选型理由 / 状态机 / API 规格 / Prompt 模板)见 [`docs/tech.md`](./tech.md)**。
> **全服务部署指南见 [`docs/deployment.md`](./deployment.md)**。
> 开发中两文档冲突时,**以本文档为准**(本文档更新频次更高)。
>
> 依赖关系:Phase 1 → Phase 2 → Phase 3 + Phase 4 → Phase 5 → Phase 6(产品化重构)

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

## Phase 6：产品化重构 ⬜（当前阶段）

> **背景**:Phase 1-5 完成了"单条视频提交→解析→展示"的核心链路 + Mock 演示。Phase 6 是基于真实运营场景的**产品化重构**——把"手动触发的任务跟踪系统"改造成"自动采集的脚本资产库"。
>
> **用户故事**:运营者每天的工作 = 订阅博主/关键词 → 系统自动采集 → 看解析结果 → 复刻脚本。不该当人肉 cron。

---

### 6.0 调度方案:Railway 原生 Cron Trigger ✅ 确认可行

Railway 支持原生 cron trigger(标准 5 字段 cron 表达式,默认 UTC)。方案:
- 在 Railway web 服务配置 cron trigger,定时 fetch 自己的 cron 端点
- 博主采集 / 关键词采集 / 数据刷新 / pipeline 推进,各配一个 cron 表达式
- 不再用前端"手动踹一脚"兜底(Vercel 时代的妥协,Railway 常驻进程不需要)

---

### 6.1 博主订阅 + 自动采集 🔴 核心

#### 数据模型变更
- [ ] `creators` 表:加 `video_count`(该博主已采集视频数)、`last_fetch_video_count`(上次采集新增数),方便卡片展示统计
- [ ] `creators` 表:`monitor_frequency` 改为**全局统一设置**(不存在每个博主不同频率),存到 settings 或环境变量 `CREATOR_FETCH_CRON`(如 `0 */1 * * *` 每小时)
- [ ] `creators` 表:`status` 支持 `active` / `paused`(暂停/启用,已有字段,差 API)

#### API
- [ ] `POST /api/creators` 放宽输入:接受 `@username` / `username` / 完整 URL,后端统一补全成 `https://www.tiktok.com/@username`
- [ ] `PATCH /api/creators/[id]` 新增:切换 `status`(active ↔ paused)
- [ ] `GET /api/creators/[id]/videos` 新增:该博主名下所有视频(带解析状态 + 指标)

#### 采集逻辑(`monitor-creators` cron 改造)
- [ ] **首次订阅 = 全量采集**:Apify `profiles` 抓该博主全部视频,全部入库(source_type='creator_monitor'),全部进入解析 pipeline
- [ ] **后续周期 = 增量 + 数据刷新**:
  - 新视频入库 + 进解析 pipeline
  - 老视频(已存在的 tiktok_video_id)刷新互动数据(play_count/like_count/comment_count/share_count/collect_count),不重新解析
- [ ] 采集时跳过 `status='paused'` 的博主
- [ ] 采集完更新 `last_fetch_time` + `last_fetch_video_count`

#### 前端:博主列表页(`/creators`)
- [ ] 每个博主 = 一个**订阅卡片**,展示:
  - 头像 + @用户名 + 分类
  - 统计:已采集 N 条 / 已解析 M 条 / 上次采集时间 / 新增 X 条
  - 状态开关:active(采集中)/ paused(已暂停)
  - 操作:暂停/启用、删除
- [ ] 添加博主对话框:输入 `@username` 或 URL,可选填分类
- [ ] 卡片可展开/点击 → 进入**该博主的视频列表页**

#### 前端:博主详情页(`/creators/[id]`)— 新页面
- [ ] 顶部:博主信息(头像/名称/统计/状态)
- [ ] 主体:该博主采集到的所有视频列表(表格或卡片网格)
  - 每条:封面 + 标题 + 解析状态 badge + 播放/点赞 + 采集时间
  - 解析中/异常的视频灰显,解析完成的可点击进详情
- [ ] 新采集的视频高亮标记(如"NEW" badge 或排序置顶)

---

### 6.2 关键词订阅 + 自动采集 🔴 核心

#### 数据模型变更
- [ ] `keywords` 表加采集筛选条件字段(订阅时设置,采集时应用):
  - `min_play_count` INTEGER — 最低播放量门槛(如 ≥10000)
  - `min_like_count` INTEGER — 最低点赞门槛
  - `published_after` TIMESTAMPTZ — 只采集此时间之后的视频(如近 7 天)
  - `min_duration_sec` / `max_duration_sec` INTEGER — 时长范围(过滤过长/过短)
  - `unwanted_hashtags` TEXT[] — 排除带某些标签的视频
- [ ] `keywords.monitor_frequency` 同博主,改为全局统一设置 `KEYWORD_FETCH_CRON`

#### 采集逻辑(`search-keywords` cron 改造)
- [ ] Apify `searchQueries` 抓搜索结果
- [ ] **按筛选条件过滤**(入库前):
  - play_count ≥ min_play_count?
  - like_count ≥ min_like_count?
  - publish_time ≥ published_after?
  - duration 在范围内?
  - 不含 unwanted_hashtags?
  - 不满足任一条件 → 跳过不入库(省解析成本)
- [ ] 通过筛选的 → 去重(tiktok_video_id)→ 入库(source_type='keyword_search')→ 解析 pipeline
- [ ] 采集完更新 `last_fetch_time`

#### 前端:关键词列表页(`/keywords`)
- [ ] 每个关键词 = 一个**订阅卡片**,展示:
  - 关键词文本 + 地区 + 语言
  - 筛选条件摘要(如"播放≥1万 · 近7天 · 15-60秒")
  - 统计:已采集 N 条 / 已解析 M 条 / 上次采集时间
  - 状态开关 + 删除
- [ ] 添加关键词对话框:输入关键词 + 设置筛选条件(播放量/时间/时长/排除标签)
- [ ] 卡片点击 → 该关键词的视频列表页

#### 前端:关键词详情页(`/keywords/[id]`)— 新页面
- [ ] 同博主详情页结构:关键词信息 + 该关键词采集到的视频列表

---

### 6.3 单条视频解析(保留)🟡

- [ ] 首页或顶部保留一个**单条解析入口**:粘贴 TikTok 视频 URL → 一次性解析
- [ ] 单条解析不走订阅/采集,直接 `POST /api/tasks` { task_type: 'analyze_video' } → 解析 pipeline → 完成后在视频库可见
- [ ] 单条解析的视频 `source_type='manual_video'`,在视频库可按来源筛选区分

---

### 6.4 视频详情页增强(视频素材区)🟠

当前详情页直接展示 8 区块分析结果,缺了 Spec 要求的"原始素材"展示。改造:
- [ ] 详情页顶部加**视频素材区**:
  - **视频播放器**:如果 `video_file_url` 有值,嵌入 `<video>` 可播放;无值显示封面图 + "视频下载失败"提示
  - **解析状态 badge**:completed / failed / 处理中(带进度文案)
  - **原始互动数据**:播放/点赞/评论/分享/收藏(原始数值,非格式化)
  - **完整旁白文本**:从 video_assets 取 subtitle,展开可读
- [ ] 素材区下方才是 8 区块分析结果(现有 analysis-view)
- [ ] 解析失败时:素材区显示错误原因(error_message)+ 重试按钮
- [ ] 解析中时:素材区显示进度文案 + 自动轮询(已有 pending-analysis-panel 逻辑)

---

### 6.5 统一视频库(`/videos`)🟠

所有来源的视频(博主采集 / 关键词采集 / 手动解析)统一在这里:
- [ ] **筛选**:按来源(source_type: creator_monitor / keyword_search / manual_video)、解析状态、博主、关键词
- [ ] **搜索**:按标题/作者搜索
- [ ] **"新采集"标记**:最近 24 小时内入库的视频高亮(NEW badge 或排序置顶 + 视觉区分)
- [ ] **排序**:按采集时间 / 播放量 / 点赞数
- [ ] 表格列优化:封面 + 标题 + 来源(博主/关键词图标)+ 播放/点赞 + 解析状态 + 采集时间

---

### 6.6 首页汇总仪表盘 🟡

首页从"提交入口"升级为"工作台汇总":
- [ ] **汇总数字**:已订阅博主 N 个 / 已订阅关键词 M 个 / 视频库共 X 条 / 今日新增 Y 条 / 待解析 Z 条
- [ ] **最近活动**:最近采集的视频(缩略图列表,5-10 条)
- [ ] **解析状态**:当前正在解析的视频进度
- [ ] **快速解析入口**:单条 URL 解析(保留,但降级为次要位置)

---

### 6.7 清理 Vercel 时代遗留 🟡

- [ ] 删除 `creator-card.tsx` / `keyword-card.tsx` 的"立即抓取/搜索"按钮(改为自动定时,不需要手动触发)
- [ ] 删除 `pending-analysis-panel.tsx` 的 60s "踹一脚" 兜底(Railway 常驻进程,pipeline 接力更可靠)
- [ ] 设置页"手动触发"区块改为"调度状态"展示(上次运行时间 / 下次预计 / 各任务状态)
- [ ] 删除前端所有 `fetch('/api/cron/...')` 的直接调用(cron 由 Railway 定时触发,不再前端调)

---

### 6.8 安全加固(已完成 + 后续可选)

- [x] **Supabase RLS** — 6 表开 RLS,anon 只读,REVOKE 写权限
- [x] **cron 端点鉴权** — `requireCronAuth`,X-Cron-Secret / 同源 / 开发环境
- [x] **前端不再裸查 DB** — task-list 走 API
- [ ] **API 限流**(可选)— Upstash Ratelimit

---

### 6.9 健壮性(可选,不阻塞核心)

- [ ] handler 失败重试(指数退避,最多 3 次)
- [ ] 结构化日志(pino)+ Sentry
- [ ] 成本控制(Gemini 月度预算上限)

---

### 6.10 已知限制(登记在案)

- slideshow 视频(`isSlideshow:true`)无 mp4 → worker 下不到 → 走封面+字幕降级
- 长视频(>25MB)base64 超 Gemini token 上限 → 跳过视频走封面降级
- Railway cron 默认 UTC 时区,配置时注意换算

---

## 页面结构总览(v1.0 目标)

```
/                        首页(汇总仪表盘 + 快速解析入口)
/creators                博主列表(订阅卡片网格)
/creators/[id]           博主详情(该博主视频列表)         ← 新页面
/keywords                关键词列表(订阅卡片网格)
/keywords/[id]           关键词详情(该关键词视频列表)      ← 新页面
/videos                  统一视频库(全来源 + 筛选 + 搜索 + NEW 标记)
/videos/[id]             视频详情(素材区 + 播放器 + 8 区块)
/settings                设置(调度状态 + API key 配置)
```

## 采集调度总览

```
Railway Cron Trigger(UTC)
  ├─ CREATOR_FETCH_CRON(如 0 */1 * * *)  → /api/cron/monitor-creators
  │    遍历 active 博主 → Apify profiles 抓取 → 新视频入库+解析 / 老视频刷新数据
  │
  ├─ KEYWORD_FETCH_CRON(如 30 */2 * * *) → /api/cron/search-keywords
  │    遍历 active 关键词 → Apify searchQueries → 按筛选条件过滤 → 入库+解析
  │
  ├─ PROCESS_PIPELINE_CRON(如 */5 * * * *) → /api/cron/process
  │    推进待处理视频的解析 pipeline(补 HTTP 调用链的不足)
  │
  └─ REFRESH_METRICS_CRON(如 0 0 * * *)   → /api/cron/refresh-metrics
       刷新所有 completed 视频的互动数据(播放/点赞/评论)
```

## 任务依赖图

```
Phase 1-5(已完成)✅
  │
  ▼
Phase 6 产品化重构
  │
  ├─ 6.1 博主订阅+自动采集 🔴
  ├─ 6.2 关键词订阅+自动采集 🔴
  │    (6.1 + 6.2 共享调度器 + 采集逻辑)
  │
  ├─ 6.3 单条解析(保留)🟡
  ├─ 6.4 视频详情页增强 🟠
  ├─ 6.5 统一视频库 🟠
  ├─ 6.6 首页仪表盘 🟡
  ├─ 6.7 清理 Vercel 遗留 🟡
  └─ 6.8-6.10 安全/健壮性/限制 ⚪
```

## 文件统计

| Phase | 文件 | 状态 |
|-------|------|------|
| 1 | lib/(supabase/r2/apify/gemini/pipeline) + types + utils | ✅ |
| 2 | 7 API + 调度器 + 6 Handler + worker client | ✅ |
| 3 | 3 页面 + 8 组件 + 轮询 | ✅ |
| 4 | 6 API + 3 页面 + monitor 共享组件 | ✅ |
| 5 | deployment.md + README + 4 migration + 文档 + 清理 | ✅ |
| Railway | worker/(server.js + Dockerfile + package.json) | ✅ 已部署 |
| **6(计划)** | 2 新页面 + 调度器 + schema 变更 + 前端重构 | ⬜ |
| **合计** | ~55 文件(Phase 1-5)→ ~70 文件(Phase 6 后) | |
