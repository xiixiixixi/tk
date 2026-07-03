# TikTok 爆款脚本分析工作台：技术架构与实施手册 v0.5

> 本文档是唯一的技术事实来源。每个章节的目标是：开发者在没有额外沟通的情况下可以独立实现。
>
> **选型确认：Vercel Hobby（免费）+ Supabase（免费数据库）+ Cloudflare R2（免费存储）**

---

## 1. 总体结论

### 1.1 技术栈

```
Vercel Hobby（网页 + API + HTTP 调用链）
+ Supabase（Postgres 数据库 + 去重 + 状态机）
+ Cloudflare R2（视频文件 + 关键帧 + 封面图存储）
+ Apify（TikTok 抓取）
+ Gemini 官方 API（视频理解）
```

### 1.2 为什么这个组合

| 组件 | 免费额度 | 够用吗 |
|------|---------|--------|
| Vercel Hobby | 100GB 带宽、10 万次函数/月 | ✅ 够用，10 秒超时用 HTTP 调用链解决 |
| Supabase | 500MB 数据库、5GB 带宽/月 | ✅ 只存结构化数据，绰绰有余 |
| R2 | 10GB 存储、免流量费 | ✅ 存几百个 MP4 没问题，读文件不花钱 |

### 1.3 不做的事

```
❌ 浏览器插件
❌ 自研 TikTok 爬虫
❌ 完整 SaaS 权限系统
❌ 复杂任务队列（Inngest / QStash）
❌ 评论深度分析
❌ ffmpeg 服务端视频处理（MVP 用 Apify 字幕 + 封面图代替）
```

### 1.4 MVP 成功定义

一个用户打开网页 → 粘贴 TikTok 视频链接 → 点「分析」→ 看到「分析中」→ 等几十秒 → 页面自动刷新出脚本拆解结果。

---

## 2. 核心约束：Vercel Hobby 的限制与对策

### 2.1 两个硬限制

| 限制 | 数值 | 影响 |
|------|------|------|
| 函数超时 | **10 秒** | 单次 API 调用不能超过 10 秒 |
| Cron Jobs | **不支持** | 没有定时任务，步骤触发必须另想办法 |

### 2.2 为什么必须异步

一条视频的完整处理：

| 操作 | 耗时 |
|------|------|
| Apify Actor 启动 + 等待 TikTok 数据返回 | 5–20 秒 |
| 下载视频文件到 R2 | 5–30 秒 |
| Gemini API 调用 | 5–15 秒 |
| **合计** | **15–65 秒** |

10 秒的超时限制意味着整条链路必须切成多个独立步骤，每个步骤一次函数调用，单步 < 10 秒。

### 2.3 步骤切分（7 步）

```
Step 1a: 启动 Apify Actor              耗时 ~1s   状态 → apify_started
Step 1b: 轮询 Apify 结果               耗时 ~3s   状态 → metadata_fetched
Step 2:  下载 MP4 + 封面到 /tmp        耗时 ~5s   状态 → video_downloaded
Step 3:  上传到 R2                     耗时 ~5s   状态 → video_processed
Step 4:  提取旁白（Apify 字幕优先）      耗时 ~1s   状态 → audio_extracted
Step 5:  Gemini 分析                  耗时 ~8s   状态 → analyzing
Step 6:  保存结果到 Supabase           耗时 ~1s   状态 → completed
```

每步都控制在 10 秒以内。

### 2.4 HTTP 调用链：解决 Cron 缺失

Vercel Hobby 不支持 Cron Jobs。**步骤之间用 HTTP 调用链串联：每一步成功后，用 `fetch()` 触发下一步。**

```
用户提交任务
  ↓
POST /api/tasks（同步，< 2 秒）
  │  创建 task + video 记录，状态 = new
  │  返回 { taskId } 给用户
  │
  └──→ 副作用：fetch('/api/cron/process')     ← 触发 Step 1a
            │
            ▼
       Step 1a 完成 → fetch('/api/cron/process')  ← 触发 Step 1b
            │
            ▼
       Step 1b 完成 → fetch('/api/cron/process')  ← 触发 Step 2
            │
            ▼
         ... 接力下去直到 completed
```

**每个步骤末尾的关键代码：**

```typescript
// handler 执行成功后
await updateVideoStatus(video.id, nextStatus)

// 接力棒传给下一步
fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/process`)
  .catch(err => console.error('chain error:', err))
```

### 2.5 链断裂兜底

HTTP 调用链的风险：某一步超时，没来得及 `fetch` 下一步，链就断了。

**前端兜底机制：**

```typescript
// 前端每 3 秒轮询任务状态时
if (
  status !== 'completed' &&
  status !== 'failed' &&
  Date.now() - lastUpdatedAt > 60_000  // 卡住超过 1 分钟
) {
  fetch('/api/cron/process')  // 前端主动踹一脚，重新接上链条
}
```

### 2.6 前端轮询策略

```typescript
const POLL_INTERVAL = 3000    // 3 秒
const POLL_MAX = 80           // 最多 80 次 = 4 分钟
const STUCK_THRESHOLD = 60_000 // 60 秒未更新判定为断链

const statusLabels: Record<string, string> = {
  new:                '排队中…',
  apify_started:      '正在连接 TikTok…',
  metadata_fetched:   '正在获取视频数据…',
  video_downloaded:   '正在保存视频文件…',
  video_processed:    '正在处理视频画面…',
  audio_extracted:    '正在提取旁白字幕…',
  analyzing:          'AI 正在分析脚本结构…',
  completed:          '分析完成',
  failed:             '分析失败',
}
```

### 2.7 任务状态机

```
new                    — INSERT 时的初始状态
  ↓
apify_started          — Apify Actor 已启动，等待结果返回
  ↓
metadata_fetched       — tiktok_video_id + 标题 + 作者 + 播放量等已就绪
  ↓
video_downloaded       — MP4 + 封面已下载到 /tmp
  ↓
video_processed        — 视频文件已上传到 R2，关键帧 URL 已记录
  ↓
audio_extracted        — 旁白/字幕文本已提取
  ↓
analyzing              — Gemini 正在分析中
  ↓
completed              — 分析完成（终态）

任何步骤出错 → failed  — 失败（终态）
重复视频     → duplicate — 重复（终态）
用户重新分析 → pending_analysis → 新建 analysis_version → 回到 new
```

---

## 3. 技术选型详情

### 3.1 前端

```
Next.js 14 (App Router)
TypeScript（strict mode）
Tailwind CSS v3.4
shadcn/ui
```

为什么 Next.js：
- 页面和 API 在同一项目，不需单独起后端
- App Router 的 Server Components 减少客户端 JS
- Vercel 原生部署，零配置

为什么 shadcn/ui：
- 代码直接复制进项目，不增加 npm 依赖
- 基于 Tailwind，样式体系统一
- 按需引入，不膨胀

### 3.2 数据库：Supabase Postgres

```
免费额度：500MB 数据库、5GB 带宽/月
SDK：@supabase/supabase-js
```

为什么 Supabase：
- 就是标准 Postgres，不锁定，随时可迁移
- 自带 Dashboard（建表、查询、数据浏览有 GUI）
- 自带 REST API，前端简单查询不需要写后端接口
- 本地可用 Supabase CLI 开发

### 3.3 文件存储：Cloudflare R2

```
免费额度：10GB 存储、100 万次写/月、1000 万次读/月
流量费：$0（不收入向和出向流量费，这是 R2 最大优势）
SDK：@aws-sdk/client-s3（R2 兼容 S3 API）
```

存什么：

```
视频原始文件（MP4）
视频封面图
关键帧图片
音频文件（如有）
字幕文件（如有）
```

为什么 R2 而不是继续用 Supabase Storage：
- Supabase Storage 免费只有 **1GB**，约 30–100 个 MP4 就满了
- R2 免费 **10GB**，而且 **不收流量费**（Supabase Storage 月度带宽 5GB，被看几百次就到了）
- R2 兼容 S3 API，代码层面就是一个 `@aws-sdk/client-s3`，和其他 S3 存储写法一样

### 3.4 TikTok 抓取：Apify

```
Actor：clockworks/tiktok-scraper
API：POST https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs
```

Apify 返回数据的关键字段：

```
{
  id: "视频 ID",
  text: "标题/描述",
  createTime: "发布时间",
  authorMeta: { id, name, nickName, avatar },
  videoMeta: { duration, coverUrl, downloadUrl },
  webVideoUrl: "https://www.tiktok.com/@user/video/xxx",
  diggCount, shareCount, commentCount, playCount,
  hashtags: [{ name }],
  textExtra: []   // 可能包含字幕
}
```

### 3.5 视频理解：Gemini 官方 API

```
SDK：@google/generative-ai
模型：gemini-2.5-flash（默认）/ gemini-2.5-pro（高质量）
```

为什么直接调 Gemini 而非通过 OpenRouter：
- 原生支持图片输入（关键帧分析）
- File API 支持视频上传
- 少一层代理，少一个失败点

### 3.6 Mock 模式

由环境变量控制，不配外部 API Key 时自动启用：

```bash
MOCK_APIFY=true     # Apify 返回模拟数据
MOCK_GEMINI=true    # Gemini 返回模拟分析结果
```

Mock 模式下所有外部调用走本地硬编码数据，但数据库操作、状态机、HTTP 调用链都是真实代码路径。开发和演示不花钱。

---

## 4. 数据库设计（含 SQL）

### 4.1 通用约定

- 主键用 `UUID`，默认 `gen_random_uuid()`
- 所有表带 `created_at` 和 `updated_at`
- 所有时间用 `TIMESTAMPTZ`
- 文本内容用 `TEXT`

### 4.2 触发器

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

### 4.3 videos 表

```sql
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

CREATE UNIQUE INDEX idx_videos_tiktok_video_id ON videos(tiktok_video_id);
CREATE INDEX idx_videos_analysis_status ON videos(analysis_status, created_at);
CREATE INDEX idx_videos_source_type ON videos(source_type);
CREATE INDEX idx_videos_author_id ON videos(author_id);

CREATE TRIGGER trg_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

`analysis_status` 值：`new`, `apify_started`, `metadata_fetched`, `video_downloaded`, `video_processed`, `audio_extracted`, `analyzing`, `completed`, `failed`, `duplicate`, `pending_analysis`

`source_type` 值：`manual_video`, `creator_monitor`, `keyword_search`, `hashtag_search`

### 4.4 video_assets 表

```sql
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
```

`asset_type` 值：`mp4`, `cover`, `frame`, `audio`, `subtitle`

### 4.5 analysis_results 表

```sql
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
CREATE UNIQUE INDEX idx_analysis_results_version ON analysis_results(video_id, analysis_version);
```

### 4.6 creators 表

```sql
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
```

### 4.7 keywords 表

```sql
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
```

### 4.8 tasks 表

```sql
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

CREATE INDEX idx_tasks_status_created ON tasks(status, created_at);

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

`task_type` 值：`analyze_video`, `monitor_creator`, `search_keyword`, `refresh_metrics`, `reanalyze_video`

### 4.9 RLS 策略

第一版不做用户系统，所有表匿名可访问。后续加 Supabase Auth 再加 RLS。

---

## 5. R2 Storage 设计

### 5.1 Bucket 配置

```
服务：Cloudflare R2
Bucket 名称：tiktok-assets
访问权限：公开可读（通过 R2 的 Public Access 设置）
自定义域名：可选，R2 默认提供 https://<account>.r2.cloudflarestorage.com/<bucket>/...
            或绑定自己的域名（如 https://assets.你的域名.com/）
```

### 5.2 目录结构

```
/{video_id}/
  ├── video.mp4
  ├── cover.jpg
  ├── frames/
  │   ├── 0000.jpg
  │   ├── 0001.jpg
  │   └── ...
  ├── audio.mp3
  └── subtitles.txt
```

### 5.3 公开访问 URL

R2 文件上传后获得公开 URL 格式：

```
https://<your-account>.r2.cloudflarestorage.com/tiktok-assets/{video_id}/cover.jpg
```

或配置自定义域名后：

```
https://cdn.你的域名.com/{video_id}/cover.jpg
```

推荐配自定义域名（`cdn.xxx.com`），URL 更干净。

### 5.4 代码中使用 R2

```typescript
// lib/r2.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

// 上传文件
export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  return r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

// 获取公开 URL
export function getR2PublicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`
}
```

---

## 6. API 路由设计

### 6.1 同步 API（前端直接调用，< 5 秒）

#### POST /api/tasks — 创建任务

```typescript
// Request
{
  task_type: 'analyze_video' | 'monitor_creator' | 'search_keyword',
  input_value: string,
  options?: { fetch_limit?: number; force_reanalyze?: boolean }
}

// Response 201
{ task_id: string; status: string; message: string }
```

逻辑：
1. 校验 input_value 是否为空
2. 根据 task_type 校验格式
3. INSERT INTO tasks
4. 如果是 analyze_video → INSERT INTO videos（analysis_status = 'new'）
5. 返回 task_id
6. **副作用**：`fetch('/api/cron/process')` 立即触发第一步（启动 HTTP 调用链）

#### GET /api/tasks/:id — 查询任务状态

```typescript
// Response 200
{
  task_id: string
  task_type: string
  status: string           // analysis_status
  current_step: string     // 人类可读
  related_video_id: string | null
  error_message: string | null
  created_at: string
  video?: { /* 分析完成后包含完整视频数据 + 分析结果 */ }
}
```

前端 3 秒轮询一次，卡住 60 秒时主动调一次 `/api/cron/process` 兜底。

#### GET /api/videos — 视频库列表

```typescript
// Query: page, page_size, status, source_type, sort, order
// Response 200
{ videos: [...]; total: number; page: number; page_size: number }
```

#### GET /api/videos/:id — 视频详情

```typescript
// Response 200
{
  video: {
    // videos 表全部字段
    assets: [{ asset_type, asset_url, timestamp }]
    analysis: { /* analysis_results 全部字段 */ } | null
  }
}
```

#### 博主 / 关键词 / 设置

```
GET    /api/creators      — 博主列表
POST   /api/creators      — 添加博主
DELETE /api/creators/:id  — 删除博主

GET    /api/keywords      — 关键词列表
POST   /api/keywords      — 添加关键词
DELETE /api/keywords/:id  — 删除关键词

GET    /api/settings      — 获取系统状态（Mock 状态、API Key 配置状态等）
POST   /api/settings      — 保存设置
```

### 6.2 异步管线 API（HTTP 调用链入口）

#### GET /api/cron/process — 核心调度器

被三种方式触发：
- **HTTP 调用链**：每个步骤末尾 `fetch()` 触发（主力）
- **前端兜底**：卡住 > 60 秒时触发
- **手动触发**：设置页或开发调试时手动调

```typescript
// Response 200
{ processed: 0 | 1; video_id?: string; old_status?: string; new_status?: string }
```

实现伪代码：

```text
1. SELECT * FROM videos
   WHERE analysis_status IN (
     'new', 'apify_started', 'metadata_fetched', 'video_downloaded',
     'video_processed', 'audio_extracted', 'analyzing', 'pending_analysis'
   )
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED      ← 防止并发处理同一条

2. 如果没有待处理视频 → return { processed: 0 }

3. 根据 analysis_status 路由到对应 handler：
   - 'new'              → fetch_metadata()           // 启动 Apify
   - 'apify_started'     → poll_apify_result()        // 轮询 Apify 结果
   - 'metadata_fetched' → download_video()            // 下载 MP4 + 封面到 /tmp
   - 'video_downloaded'  → upload_to_r2()             // 上传到 R2
   - 'video_processed'  → extract_audio()             // 提取旁白
   - 'audio_extracted'  → analyze_with_gemini()       // Gemini 分析
   - 'analyzing'        → save_analysis_result()      // 保存结果
   - 'pending_analysis' → reset_and_restart()          // 重新分析

4. 成功 → 更新 status 到下一阶段
   失败 → status = 'failed'，记录 error_message

5. ⭐ 如果成功且不是终态（completed/failed/duplicate）：
   fetch(`${APP_URL}/api/cron/process`).catch(...)    // 接力棒

6. return { processed: 1, video_id, old_status, new_status }
```

`FOR UPDATE SKIP LOCKED` 防止 HTTP 调用链和前端兜底同时触发时处理同一条视频。

---

## 7. Handler 详细设计

### 7.1 fetch_metadata — 启动 Apify

```
输入：video 记录（status = 'new'）
输出：apify_run_id
单步耗时：~1s

流程：
1. POST https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs
   传入 video.original_url
2. 拿到 runId
3. UPDATE videos SET apify_run_id = runId, analysis_status = 'apify_started'
```

### 7.2 poll_apify_result — 轮询 Apify 结果

```
输入：video 记录（status = 'apify_started'）
输出：视频元数据 + 查重结果
单步耗时：~3s

流程：
1. GET https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs/{apify_run_id}
2. 如果 status ≠ 'SUCCEEDED' → 不更新状态，return（下次链触发时再查）
3. 如果 SUCCEEDED → GET dataset items
4. 提取 tiktok_video_id
5. 用 tiktok_video_id 查 videos 表：

   情况 A：已有 video_id
     a. 已有 completed → 当前记录标记为 duplicate，关联到已有视频
     b. 已有但非终态 → 不做处理

   情况 B：不存在 → 写入所有元数据：
     tiktok_video_id, title, description, author_id, author_name,
     publish_time, duration, play_count, like_count, comment_count,
     share_count, collect_count, hashtags, cover_url, canonical_url

6. status → metadata_fetched
```

### 7.3 download_video — 下载视频文件

```
输入：video 记录（status = 'metadata_fetched'）
输出：文件写入 Vercel 的 /tmp 目录
单步耗时：~5s

流程：
1. 从 Apify 数据中获取视频下载链接
2. 下载 MP4 → Vercel /tmp/{video_id}.mp4
3. 下载封面 → /tmp/{video_id}_cover.jpg
4. 记录临时路径到 video_assets 表
5. status → video_downloaded

降级方案（Apify 无下载链接时）：
- 跳过 MP4 下载，直接下载封面图
- 后续 Gemini 分析只用封面 + 字幕
```

### 7.4 upload_to_r2 — 上传到 R2

```
输入：video 记录（status = 'video_downloaded'）
输出：R2 公开 URL
单步耗时：~5s

流程：
1. 从 /tmp 读取 {video_id}.mp4 → 上传 R2: {video_id}/video.mp4
2. 从 /tmp 读取 {video_id}_cover.jpg → 上传 R2: {video_id}/cover.jpg
3. 更新 video_assets.asset_url 为 R2 公开 URL
4. 封面图同时也作为关键帧 frame_0000 记录
5. 更新 videos.cover_url 和 videos.video_file_url
6. status → video_processed
```

### 7.5 extract_audio — 提取旁白/字幕

```
输入：video 记录（status = 'video_processed'）
输出：旁白文本
单步耗时：~1s

流程：
1. 检查 Apify 数据中是否有字幕字段（textExtra）
2. 有 → 拼接为纯文本，INSERT video_assets (asset_type='subtitle')
3. 没有 → 降级：用视频标题 + description + hashtags 拼接
   作为「推测旁白文本」
4. status → audio_extracted
```

### 7.6 analyze_with_gemini — AI 分析

```
输入：video 记录 + 元数据 + 旁白文本 + 封面/关键帧 URL
输出：结构化分析结果 JSON
单步耗时：~8s

流程：
1. 组装分析包（见第 8 节 Prompt 模板）
2. 调 Gemini SDK
3. 解析返回 JSON → INSERT INTO analysis_results
4. status → completed
```

### 7.7 错误处理（适用于所有 handler）

```typescript
try {
  const nextStatus = await handler(video)
  await supabase.from('videos').update({ analysis_status: nextStatus }).eq('id', video.id)
} catch (error) {
  console.error(`[${handlerName}] video=${video.id}:`, error)
  await supabase.from('videos').update({ analysis_status: 'failed' }).eq('id', video.id)
  await supabase.from('tasks').update({
    status: 'failed',
    error_message: `${handlerName}: ${error.message}`.slice(0, 500)
  }).eq('related_video_id', video.id)
  // 失败不重试，等用户手动点「重试」
}
```

---

## 8. Gemini Prompt 设计

### 8.1 System Prompt

```
你是一位资深的 TikTok 短视频脚本分析师。
你的任务是根据给定的视频数据，生成一份详细的脚本拆解报告。
输出格式必须是严格的 JSON，不要有任何额外的解释文字。

分析要求：
1. 基于提供的旁白文本和视频数据进行分析
2. 判断视频类型、目标用户、核心卖点
3. 重点分析前 3 秒的钩子设计
4. 拆解分镜结构（按时间轴）
5. 分析口播/字幕的结构模式
6. 识别爆点元素
7. 生成可复刻的脚本模板
8. 给出改写建议
```

### 8.2 User Prompt 模板

```
请分析以下 TikTok 视频：

=== 视频基本信息 ===
标题：{title}
描述：{description}
作者：{author_name}
发布时间：{publish_time}
视频时长：{duration} 秒

=== 互动数据 ===
播放量：{play_count}
点赞数：{like_count}
评论数：{comment_count}
分享数：{share_count}
收藏数：{collect_count}

=== 标签 ===
{hashtags}

=== 旁白/字幕文本 ===
{subtitle_text}

=== 请按以下 JSON 格式输出分析结果 ===
{
  "video_summary": "100字以内的视频内容概述",
  "video_type": "教程类/测评类/Vlog类/挑战类/剧情类/口播类/混剪类/其他",
  "target_audience": "目标用户画像",
  "hook_0_3s": {
    "original": "前3秒的内容/画面/台词",
    "type": "疑问式/感叹式/反常识/视觉冲击/痛点直击/数据展示/其他",
    "why_it_works": "为什么能留住用户",
    "replicable_template": "可复用的钩子模板"
  },
  "storyboard": [{
    "segment": "时间段（如0-3秒）",
    "visual": "画面内容描述",
    "audio": "声音内容",
    "text": "屏幕文字",
    "purpose": "这段的作用"
  }],
  "voiceover_script": {
    "full_text": "完整口播文本",
    "structure": {
      "hook": "钩子部分",
      "pain_point": "痛点描述",
      "solution": "解决方案",
      "proof": "证明/展示",
      "cta": "转化话术"
    }
  },
  "subtitle_structure": {
    "pain_point": "痛点文案",
    "solution": "解决方案文案",
    "proof": "证明文案",
    "cta": "转化文案"
  },
  "visual_structure": {
    "character": "人物设定",
    "product": "产品展示方式",
    "scene": "场景描述",
    "camera": "镜头运用",
    "text_overlay": "画面文字风格",
    "pace": "节奏特点"
  },
  "selling_points": [{
    "point": "卖点描述",
    "how_presented": "呈现方式",
    "effectiveness": "高/中/低"
  }],
  "viral_points": {
    "emotional_triggers": ["情绪触发点"],
    "contrast_points": ["反差点"],
    "visual_highlights": ["视觉亮点"],
    "comment_triggers": ["激发评论的点"],
    "share_reasons": ["分享原因"]
  },
  "replicable_script": {
    "title_template": "标题模板",
    "opening": "开头模板",
    "middle": "中段结构模板",
    "ending": "结尾模板",
    "shooting_tips": ["拍摄建议"]
  },
  "rewrite_suggestions": {
    "suitable_industries": ["适合行业"],
    "suitable_products": ["适合产品"],
    "difficulty": "低/中/高",
    "reusability": "低/中/高",
    "notes": "备注"
  }
}
```

### 8.3 调用代码

```typescript
// lib/gemini/client.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function analyzeVideo(input: AnalysisInput): Promise<AnalysisOutput> {
  if (process.env.MOCK_GEMINI === 'true') {
    return MOCK_ANALYSIS_RESULT
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  })

  const prompt = buildPrompt(input)
  const imageParts = input.frameUrls
    .filter(url => url) // 只传有效的 URL
    .map(url => ({
      fileData: { fileUri: url, mimeType: 'image/jpeg' as const }
    }))

  const result = await model.generateContent([prompt, ...imageParts])
  const text = result.response.text()

  // Gemini 可能把 JSON 包在 ```json ... ``` 里
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Gemini 返回非 JSON: ${text.slice(0, 200)}`)
  }

  return JSON.parse(jsonMatch[0])
}
```

---

## 9. 前端页面设计

路由映射：

```
/                → 首页 / 任务提交
/videos          → 视频库列表
/videos/:id      → 视频分析详情
/creators        → 博主监控
/keywords        → 关键词分析
/settings        → 设置页
```

### 9.1 首页 `/`

三个输入 Tab + 最近任务列表。

关键交互：
1. 粘贴 URL → 点「开始分析」→ `POST /api/tasks`
2. 条目出现在最近任务顶部，显示 status 对应文案 + loading 动画
3. 每 3 秒轮询 `GET /api/tasks/:id`
4. 卡住 > 60 秒 → `fetch('/api/cron/process')` 兜底
5. status = completed → 点击跳转详情
6. status = failed → 显示错误，可点重试

### 9.2 视频库 `/videos`

表格 + 分页 + 按 analysis_status / source_type 筛选。

状态 Badge：
- ✅ completed（绿色）
- 🔄 非终态（黄色 + 脉冲动画）
- ❌ failed（红色）
- 📋 duplicate（灰色）

### 9.3 视频分析详情 `/videos/:id`

从上到下 8 个区块：

```
1. 视频信息卡片（封面、标题、作者、互动数据）
2. 视频基础判断（类型、目标用户、核心卖点）
3. 前 3 秒钩子（原文、类型、留人原因、复刻模板）
4. 分镜结构（表格：时间段、画面、声音、字幕、作用）
5. 口播/字幕结构（痛点 → 解决方案 → 证明 → 转化）
6. 画面结构（人物、产品、场景、镜头、节奏）
7. 爆点分析（情绪点、反差点、视觉点、评论触发点）
8. 可复刻脚本 + 改写方向
```

非 completed 状态展示进度 + 轮询。

### 9.4 博主监控 `/creators`

博主卡片 + 添加/删除 + 「手动抓取」按钮（Hobby 版无可 Cron，需手动触发）。

### 9.5 关键词分析 `/keywords`

关键词卡片 + 添加/删除 + 「手动搜索」按钮。

### 9.6 设置页 `/settings`

Apify Key、Gemini Key 输入 + 模型选择 + 系统状态（Mock 状态、R2 连接状态、Supabase 连接状态）。

---

## 10. 项目结构

```
tiktok/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     # 首页
│   ├── globals.css
│   ├── videos/
│   │   ├── page.tsx                 # 视频库
│   │   └── [id]/page.tsx            # 详情
│   ├── creators/page.tsx
│   ├── keywords/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── tasks/
│       │   ├── route.ts             # POST / GET
│       │   └── [id]/route.ts        # GET
│       ├── videos/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── creators/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── keywords/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── settings/route.ts
│       └── cron/
│           ├── process/route.ts     # 核心调度器
│           ├── refresh-metrics/route.ts
│           ├── monitor-creators/route.ts
│           └── search-keywords/route.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # 服务端 client
│   │   ├── browser-client.ts       # 浏览器端 client
│   │   └── queries.ts
│   ├── r2/
│   │   └── client.ts               # R2 S3 兼容客户端
│   ├── apify/
│   │   ├── client.ts
│   │   └── mock.ts
│   ├── gemini/
│   │   ├── client.ts
│   │   ├── prompt.ts
│   │   └── mock.ts
│   ├── pipeline/
│   │   ├── types.ts
│   │   ├── fetch-metadata.ts       # Step 1a: 启动 Apify
│   │   ├── poll-apify.ts           # Step 1b: 轮询结果
│   │   ├── download-video.ts       # Step 2: 下载到 /tmp
│   │   ├── upload-to-r2.ts         # Step 3: 上传 R2
│   │   ├── extract-audio.ts        # Step 4: 提取旁白
│   │   └── analyze-gemini.ts       # Step 5: Gemini 分析
│   └── utils.ts
├── components/
│   ├── ui/                         # shadcn/ui
│   ├── layout/navbar.tsx
│   ├── tasks/
│   │   ├── submit-form.tsx
│   │   ├── task-list.tsx
│   │   └── status-badge.tsx
│   ├── videos/
│   │   ├── video-table.tsx
│   │   └── analysis-view.tsx
│   ├── creators/creator-card.tsx
│   ├── keywords/keyword-card.tsx
│   └── settings/settings-form.tsx
├── supabase/migrations/00001_init.sql
├── types/index.ts
├── .env.local.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── vercel.json
```

---

## 11. 环境变量

```bash
# .env.local.example

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase（数据库）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2（文件存储）
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=tiktok-assets
R2_PUBLIC_URL=                    # 自定义域名或 R2 默认域名

# Apify（TikTok 抓取）
APIFY_API_KEY=
MOCK_APIFY=true                   # 不配 Key 时用 Mock

# Gemini（AI 分析）
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
MOCK_GEMINI=true                  # 不配 Key 时用 Mock
```

---

## 12. 部署

### 12.1 Supabase

1. [supabase.com](https://supabase.com) 创建项目
2. SQL Editor → 执行 `supabase/migrations/00001_init.sql`
3. Settings → API → 获取 `URL` 和 `anon key`
4. Settings → API → 获取 `service_role key`
5. 填入环境变量

### 12.2 Cloudflare R2

1. [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. 创建 Bucket：`tiktok-assets`
3. Settings → Public Access → 开启 Public Access
4. 创建 API Token：R2 → Manage R2 API Tokens → 创建（权限：Object Read & Write）
5. 获取 `Access Key ID` + `Secret Access Key` + `Account ID`
6. 填入环境变量

### 12.3 Vercel

1. 推送代码到 GitHub
2. [vercel.com](https://vercel.com) → Import 仓库
3. 配置环境变量（以上全部）
4. Deploy
5. Hobby 版不需要配置 Cron（vercel.json 中的 cron 配置被忽略也无妨）

### 12.4 本地开发

```bash
cp .env.local.example .env.local
# 编辑 .env.local，至少配 Supabase 的 URL 和 Key（或全部用 Mock）
npm install
npm run dev
# 手动触发处理（模拟 HTTP 调用链的第一步）：
curl http://localhost:3000/api/cron/process
```

---

## 13. 成本控制

```
1. 已分析视频不重复调 Gemini（查 tiktok_video_id 去重后直接返回）
2. 已存在视频只更新互动数据，不重新跑分析
3. 每个关键词限制抓取数量（默认 20 条）
4. 每个视频关键帧只取 1–3 张（MVP 用封面图作为唯一帧）
5. 超过 60 秒的视频只分析前 60 秒
6. 用户点「重新分析」才新建 analysis_version 再次调 Gemini
7. 评论分析不放第一版
8. HTTP 调用链末尾 fetch 非阻塞，不增加用户等待时间
9. Mock 模式零外部调用（Apify 和 Gemini 都不花钱）
10. R2 零流量费（不需要担心反复查看视频和关键帧产生费用）
```

---

## 14. MVP 开发顺序

### Phase 1：单视频分析闭环

```
☐ 1.  Next.js 项目初始化（Tailwind + shadcn/ui）
☐ 2.  Supabase 建表 migration
☐ 3.  lib/supabase 客户端
☐ 4.  lib/r2 S3 客户端
☐ 5.  lib/apify 封装（含 Mock）
☐ 6.  lib/gemini 封装（含 Mock）
☐ 7.  API: POST /api/tasks + GET /api/tasks/:id
☐ 8.  API: GET /api/cron/process（核心调度器 + HTTP 调用链）
☐ 9.  Pipeline handler: fetch_metadata（启动 Apify）
☐ 10. Pipeline handler: poll_apify_result（轮询结果 + 去重）
☐ 11. Pipeline handler: download_video（下载到 /tmp）
☐ 12. Pipeline handler: upload_to_r2（上传 R2）
☐ 13. Pipeline handler: extract_audio（提取旁白）
☐ 14. Pipeline handler: analyze_with_gemini（Gemini 分析）
☐ 15. 首页（任务提交 + 最近任务 + 轮询 + 卡住兜底）
☐ 16. 视频分析详情页（8 个区块 + 非终态 loading）
☐ 17. 端到端验证：Mock 模式 → 提交 → 调用链串行 → 完成 → 详情展示
```

### Phase 2：视频库

```
☐ 18. API: GET /api/videos + GET /api/videos/:id
☐ 19. 视频库列表页（表格 + 分页 + 筛选）
```

### Phase 3：博主监控

```
☐ 20. API: CRUD /api/creators
☐ 21. 博主监控页（含手动触发按钮）
```

### Phase 4：关键词搜索

```
☐ 22. API: CRUD /api/keywords
☐ 23. 关键词分析页（含手动触发按钮）
```

### Phase 5：收尾

```
☐ 24. 设置页（含 R2/Supabase 连接状态显示）
☐ 25. API: GET/POST /api/settings
☐ 26. README + .env.local.example
```

---

## 15. 架构图

```
用户浏览器
  │
  │  轮询每 3 秒 + 卡住时兜底触发
  ▼
┌──────────────────────────────────────────┐
│              Vercel Hobby（免费）          │
│                                           │
│  Next.js App Router                       │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  │
│  │ 6个页面 │  │ 同步API │  │ Process  │  │
│  │ SSR     │  │ < 5秒   │  │ 调度器   │  │
│  └─────────┘  └────┬────┘  └────┬─────┘  │
│                    │            │         │
│                    │    ┌───────┘         │
│                    │    │  HTTP 调用链     │
│                    │    │  fetch(自己)     │
│                    │    │  7 步接力       │
│                    │    └───────┘         │
└────────────────────┼─────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌──────────┐
    │Supabase│ │  Apify │ │  Gemini  │
    │Postgres│ │ TikTok │ │  官方API │
    │ 500MB  │ │ Scraper│ │          │
    │ 状态机 │ │        │ │          │
    └────────┘ └────────┘ └──────────┘
         
    ┌──────────────┐
    │ Cloudflare R2│
    │   10GB 存储   │
    │   免流量费    │
    │ MP4/帧/封面   │
    └──────────────┘
```

---

## 16. 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-07-03 | 初稿：总体结论、技术选型、数据库、页面 |
| v0.2 | 2026-07-03 | 异步处理模型、状态机、轮询策略 |
| v0.3 | 2026-07-03 | 完整 API 规格、Handler、Prompt、项目结构、部署 |
| v0.4 | 2026-07-03 | Hobby/Pro 双模式、HTTP 调用链详解、链断裂兜底 |
| v0.5 | 2026-07-03 | 确认方案 B：Vercel Hobby + Supabase + R2，存储从 Supabase Storage 迁移到 Cloudflare R2，移除 Pro 双模式冗余，聚焦 Hobby 7 步链路 |
