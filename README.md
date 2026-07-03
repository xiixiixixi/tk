# TikTok 爆款脚本分析工作台

把 TikTok 视频、博主和话题,自动分析成可复刻的短视频脚本资产。

粘贴一条 TikTok 链接 → 系统抓取视频 + 字幕 → Gemini 拆解出 8 区块脚本结构(钩子 / 分镜 / 口播 / 画面 / 爆点 / 可复刻脚本)。也可以挂监控博主、关键词,新视频自动入库分析。

> 技术架构与设计决策见 [`docs/tech.md`](./docs/tech.md),开发任务清单见 [`docs/task.md`](./docs/task.md),Railway Worker 部署见 [`docs/railway-worker.md`](./docs/railway-worker.md)。

---

## 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 网页 + API | Next.js 16 (App Router) + Vercel Hobby | 页面和 API 同项目,零配置部署 |
| 数据库 | Supabase Postgres | 标准 Postgres,自带 Dashboard + REST |
| 文件存储 | Cloudflare R2 (S3 兼容) | 10GB 免费 + 零流量费,存 MP4 / 封面 |
| TikTok 抓取 | Apify `clockworks/tiktok-scraper` | 不自研爬虫 |
| AI 网关 | OpenRouter(本期调 Gemini) | 统一网关,可一键切模型 |

**核心约束:Vercel Hobby 函数 10s 超时 + 不支持 Cron。** 对策:把一条视频的处理切成 6 步,每步一次函数调用,步骤之间用 HTTP 调用链(`fetch` 自己)接力;前端每 3 秒轮询,卡住 60 秒时主动踹一脚 `/api/cron/process` 兜底。

---

## Phase 完成度

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 项目初始化:Next.js + shadcn/ui + 5 个 lib 模块(supabase/r2/apify/gemini/pipeline)+ 类型定义 | ✅ |
| 2 | 异步管线:7 个 API 端点 + 核心调度器 + 6 个 Handler | ✅ |
| 3 | 前端三页:首页(三 Tab 提交 + 任务列表)/ 视频库(表格 + 筛选)/ 详情页(8 区块) | ✅ |
| 4 | 博主监控 + 关键词搜索 + 设置页 + 辅助 Cron | ✅(Mock 模式完整;真实 Apify 批量抓取见下方 stub 表) |
| 5 | 收尾:vercel.json / README / migration 一致性 / 技术债清理 | ✅ |

---

## 本地开发

### 前置准备

1. **Node.js 20+**
2. **Supabase 项目** — [supabase.com](https://supabase.com) 创建,SQL Editor 执行 `supabase/migrations/00001_init.sql` → `00002_get_next_pending_video.sql` → `00003_videos_error_message.sql`
3. **Cloudflare R2 bucket** — 创建 `tiktok-assets`,开启 Public Access(Gemini 要 fetch 视频 URL)

### 安装 + 跑起来

```bash
# 1. 装依赖
npm install

# 2. 配环境变量
cp .env.local.example .env.local
#   最小可跑:只填 Supabase 三项 + MOCK_APIFY=true + MOCK_GEMINI=true
#   (Mock 模式下 Apify / Gemini 都返回硬编码数据,数据库 + 状态机 + HTTP 调用链是真实路径)

# 3. 跑 migration(二选一)
#    a) Supabase Dashboard → SQL Editor 依次粘贴执行 3 个 .sql 文件
#    b) npm run 脚本:node scripts/run-migration.js(需要 SUPABASE_DB_PASSWORD)

# 4. 启动
npm run dev
# 打开 http://localhost:3000
```

### Mock 模式 vs 真实模式

| 开关 | Mock(`true`) | 真实 |
|------|--------------|------|
| `MOCK_APIFY` | Apify 返回硬编码假视频 | 真调 Apify Actor(需 `APIFY_API_KEY`) |
| `MOCK_GEMINI` | Gemini 返回硬编码分析结果 | 真调 OpenRouter(需 `OPENROUTER_API_KEY`) |

**开发期推荐全 Mock**:零外部调用、不花钱,但数据库写入、状态机流转、HTTP 调用链、前端轮询全是真实代码路径。

### 手动触发管线

Hobby 无 Cron,提交任务后如果链断了,手动踹一脚:

```bash
curl http://localhost:3000/api/cron/process
```

或在 **设置页** 点「推进 Pipeline」/「监控博主」/「搜索关键词」按钮。

---

## 部署到 Vercel

1. 推代码到 GitHub
2. [vercel.com](https://vercel.com) → Import 仓库
3. 配置环境变量(参考 `.env.local.example`,生产期建议关掉 Mock)
4. Deploy

**注意:**
- Hobby 档 `vercel.json` 里的 cron 配置会被忽略,靠设置页手动触发 + HTTP 调用链
- 真实长视频(15-30MB MP4)下载+上传 R2 可能撞 10s 超时,生产期需要切片或 HLS(见已知限制)
- R2 bucket 必须开 Public Access,否则 Gemini fetch 不到视频

---

## 项目结构

```
app/
├── page.tsx                  # 首页(三 Tab 提交 + 任务列表)
├── videos/                   # 视频库 + 详情页(8 区块分析)
├── creators/ keywords/ settings/
└── api/
    ├── tasks/ videos/ creators/ keywords/ settings/   # 同步 API
    └── cron/                                         # 异步管线(4 个端点)
lib/
├── supabase/ r2/ apify/ gemini/    # 外部服务封装(各含 mock)
├── pipeline/                       # 6 个 Handler + 类型
└── utils.ts
components/                         # shadcn/ui + 业务组件
supabase/migrations/                # 3 个 SQL
```

---

## 已知限制 / Stub

| 项 | 现状 | 计划 |
|----|------|------|
| `refresh-metrics` cron | stub,返回计数不刷新 | Phase 6+:接 Apify 增量 metrics API |
| `monitor-creators` / `search-keywords` cron | Mock 模式入库假视频;真实模式未接 Apify 批量 | Phase 6+:接真实 Apify |
| `extract-subtitle.ts` 的 Whisper | 占位,降级到 title+description+hashtags 文本拼接 | 配 `WHISPER_API_KEY` 后接 OpenAI Whisper |
| 长视频上传 R2 | 真实 15-30MB MP4 撞 Vercel 10s 超时风险 | 生产期切片或 HLS |
| RLS | 第一版匿名可访问,无用户系统 | 后续加 Supabase Auth + RLS |

详见 [`docs/tech.md`](./docs/tech.md) 「已知 Stub」段。

---

## 脚本

| 脚本 | 用途 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint |
| `node scripts/verify-r2.js` | 验证 R2 连通性(S3 鉴权 + 公开 URL) |
| `node scripts/verify-tables.js` | 验证 Supabase 6 张表是否建好 |
| `node scripts/run-migration.js` | 跑 migration(需 `SUPABASE_DB_PASSWORD`) |
