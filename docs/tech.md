# TikTok 爆款脚本分析工作台：技术架构与实施手册 v0.7

> 本文档是技术事实来源（选型理由、状态机、API 规格、Prompt 模板）。
> 执行计划见 [`docs/task.md`](./task.md)（Phase 1–5 任务清单 + 验证标准）。
> **选型确认：Railway（web + worker）+ Supabase（免费数据库）+ Cloudflare R2（公开可读,免费存储）+ OpenRouter（统一 AI 网关）**

---

## 1. 总体结论

### 1.1 技术栈

```
Railway（web 主网站 + video-worker 视频下载,同一项目内网通信）
+ Supabase（Postgres 数据库 + 去重 + 状态机 + RLS 锁权限）
+ Cloudflare R2（视频文件 + 封面图,公开可读）
+ Apify（TikTok 元数据 + ASR 字幕抓取）
+ OpenRouter（统一 AI 网关,调 gemini-3.5-flash,视频走 base64 内联,自带音频理解）
```

> **v0.8 架构变更:为什么加 Railway Worker**
> Apify `clockworks/tiktok-scraper` 实测(2026-07)在反爬升级后**不返回视频 mp4 直链**
> (`downloadUrl`/`mediaUrls` 均空,`downloadVideos:true` 把文件存内部 storage 取不到)。
> TikTok 视频文件需要 `yt-dlp` 实时解析下载,而 yt-dlp 是二进制工具 + 频繁更新反反爬,
> Vercel/Railway serverless 跑不了。
> 解决:在 Railway 上跑一个常驻 Node + yt-dlp 微服务,web 服务通过 HTTP 调用它(像调 Apify 一样)。
> 这样 web 服务和 worker 都在 Railway,统一管理。

### 1.2 为什么这个组合

| 组件 | 免费额度 | 够用吗 |
|------|---------|--------|
| Railway(web + worker) | $5 试用额度,之后 ~$5/月 | ✅ 两个服务共享额度,常驻小服务很便宜 |
| Supabase | 500MB 数据库、5GB 带宽/月 | ✅ 只存结构化数据，绰绰有余 |
| R2 | 10GB 存储、免流量费 | ✅ 存几百个 MP4 没问题，读文件不花钱 |
| Apify | 按 credit 计费 | ✅ 元数据抓取 ~$0.00025/次,很便宜 |
| OpenRouter | 按 token 计费 | ✅ Gemini flash ~$0.001/次分析 |

### 1.3 不做的事

```
❌ 浏览器插件
❌ 自研 TikTok 爬虫
❌ 完整 SaaS 权限系统
❌ 复杂任务队列（Inngest / QStash）— Railway worker 用同步 HTTP 即可
❌ 评论深度分析
❌ Vercel(已迁移到 Railway,统一管理)
❌ Google AI Studio 直接调 Gemini(走 OpenRouter 统一网关,便于切换模型)
❌ 在 web 服务里跑 yt-dlp(放 Railway worker)
```

### 1.4 MVP 成功定义

一个用户打开网页 → 粘贴 TikTok 视频链接 → 点「分析」→ 看到「分析中」→ 等几十秒 → 页面自动刷新出脚本拆解结果。

---

## 2. 核心约束：视频处理管线设计

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

### 2.3 步骤切分（6 步）

```
Step 1a: 启动 Apify Actor              耗时 ~1s   状态 → apify_started
Step 1b: 轮询 Apify 结果 + 字幕         耗时 ~3s   状态 → metadata_fetched
Step 2:  调 Railway Worker 下载 MP4 + 传 R2  耗时 ~8s   状态 → video_processed
Step 3:  提取字幕(Apify 字幕优先,无则文本降级)  耗时 ~1s   状态 → audio_extracted
Step 4:  组装分析包 + Gemini 分析(视频 base64 内联)  耗时 ~8s   状态 → analyzing
Step 5:  保存结果到 Supabase           耗时 ~1s   状态 → completed
```

**v0.8 关键变化**(相对 v0.7):
- Step 2 从"Apify downloadUrl 直传"改为**调 Railway Worker**(yt-dlp 解析真实 mp4 → 传 R2)。因为 Apify 反爬升级后不返回直链
- Gemini 输入从"R2 视频 URL"改为"**base64 内联**"(OpenRouter 不支持任意 mp4 URL,只支持 YouTube 链接 + base64 data URL)
- Whisper 独立成 `lib/whisper/client.ts`,Apify 字幕空时 ASR 降级 ~~(v0.8 后续验证后已移除:Gemini 自身能听视频音频,Whisper 多余)~~

### 2.4 HTTP 调用链：解决 Cron 缺失

Railway 无内置 Cron 触发器。**步骤之间用 HTTP 调用链串联：每一步成功后，用 `fetch()` 触发下一步。**

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
  // v0.7 deprecated: 状态本身不再使用,保留条目以兼容老数据/老告警路由
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
video_downloaded       — MP4 + 封面已下载到 /tmp  **[DEPRECATED since v0.7, do not use]** — 实际流转已跳过此状态(Step 2+3 合并)
  ↓
video_processed        — 视频文件已上传到 R2，关键帧 URL 已记录 (v0.7 合并了原 video_downloaded + uploaded 状态)
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

### 2.8 Railway Worker —— 视频下载微服务

**为什么独立服务**:yt-dlp 是二进制 + 频繁更新反反爬,web 服务(无持久 FS)跑不了。放 Railway 常驻 Node 进程,web 服务通过 HTTP 调用(和调 Apify 一样的模式)。

**架构**:
```
web 服务 (Step 2 handler)
  │  POST { url, r2Key } https://<worker>.up.railway.app/download
  ▼
Railway Worker (Node + yt-dlp)
  │  1. yt-dlp 解析 TikTok URL → 拿真实 mp4 直链
  │  2. 下载 mp4 到内存
  │  3. 用 R2 凭据上传到 {r2Key}
  ▼
返回 { r2Url, size, duration } 给 web 服务
```

**Worker 职责(单一)**:
- 输入:`{ url: TikTok 视频页 URL, r2Key: R2 存储路径 }`
- 输出:`{ r2Url: R2 公开 URL, size: 字节数, duration: 秒 }`
- 错误:`{ error: "...", errorCode: "DOWNLOAD_FAILED" | "VIDEO_NOT_FOUND" }`

**为什么 worker 自己传 R2(而不是返回 mp4 给 web 服务)**:
- 视频 5-30MB,走 web 服务中转会浪费带宽
- worker 直接用 R2 凭据上传,web 服务只收一个 URL 字符串

**web 侧的超时对策**:
- Step 2 handler 调 worker 用 `AbortController` 设 50s 超时
- ⚠️ 这会超过单步处理时间 → Step 2 需要拆成两步:
  - `Step 2a`:POST 触发 worker,拿到 `jobId` 立即返回(状态 → `downloading`)
  - `Step 2b`:轮询 `GET /status/{jobId}`,完成才推进(状态 → `video_processed`)
- 或简化方案:worker 同步等待(短视频 <8s 能跑完),长视频超时标 failed 后续重试

**Worker 技术栈**:
- Node.js 20 + Express(或 Hono)
- `yt-dlp`(系统级安装,Railway Dockerfile 里 `apt-get install` 或用 `youtube-dl-exec` npm 包)
- `@aws-sdk/client-s3`(直接传 R2)
- 无状态、可水平扩展(每个请求独立)

**安全**:
- Worker 暴露在公网,用 `WORKER_SECRET` 共享密钥鉴权(web 服务请求头带 `X-Worker-Secret`)
- R2 凭据只配在 worker 端,web 服务不直接传文件

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
- Railway 原生部署,零配置

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

### 3.5 视频理解：OpenRouter 调 Gemini

```
SDK：原生 fetch（OpenRouter 兼容 OpenAI Chat Completions 格式）
模型：google/gemini-3.5-flash（默认）/ google/gemini-2.5-pro（高质量）
Base URL：https://openrouter.ai/api/v1
```

**为什么走 OpenRouter 而非 Google AI Studio**:
- 统一网关,后期可一键切换模型(OpenRouter 上 Gemini / Claude / GPT 都有)
- 不用绑 Google Cloud 结算账户
- 月度消费可视化、限流配置在 OpenRouter Dashboard

**注意**:OpenRouter 上 Gemini 模型 ID 是 `google/gemini-3.5-flash`(带 `google/` 前缀),不是 Google AI Studio 的 `gemini-3.5-flash`。env 字段用 `GEMINI_MODEL` 存 OpenRouter ID。

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

`analysis_status` 值:`new`, `apify_started`, `metadata_fetched`, `~~video_downloaded~~ (deprecated since v0.7)`, `video_processed`, `audio_extracted`, `analyzing`, `completed`, `failed`, `duplicate`, `pending_analysis`

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
访问权限：⚠️ 必须开 Public Access（Gemini 要 fetch 视频 URL 理解内容,不开 R2 私有,Google 拿不到）
自定义域名：强烈推荐绑定（如 https://cdn.你的域名.com）,R2 默认域名 r2.cloudflarestorage.com 在某些地区访问不稳
```

### 5.1.1 开发期 vs 生产期 Public Access

- **开发期**(.r2.dev + Public Access):本项目当前默认。优点:零配置,Gemini 直接 fetch 公开 URL;缺点:任何人能下载视频,版权风险 + .r2.dev 限速。

- **生产期**(Presigned URL):改成用 AWS SDK 生成 1 小时过期的签名 URL,关掉 Public Access。代码示例:

```typescript
import { S3Client } from '@aws-sdk/client-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: {...} })

export async function getR2PresignedUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
  return getSignedUrl(r2, cmd, { expiresIn: 3600 })  // 1 hour
}
```

优点:链接 1 小时自动失效,不开 Public Access,合规更好。
实施前置:实测 Google Gemini 能不能 fetch R2 S3 endpoint(还没验证,见 scripts/verify-r2-presigned.js 待写)。

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
     'new', 'apify_started', 'metadata_fetched',
     'video_processed', 'audio_extracted', 'analyzing', 'pending_analysis'
     -- ~~'video_downloaded'~~ (v0.7 deprecated, 不再作为待处理状态查询)
   )
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED      ← 防止并发处理同一条

2. 如果没有待处理视频 → return { processed: 0 }

3. 根据 analysis_status 路由到对应 handler(v0.7 6 步):
   - 'new'              → fetch-metadata()         // 启动 Apify
   - 'apify_started'    → poll-apify()             // 轮询 Apify 结果 + 字幕
   - 'metadata_fetched' → upload-video-to-r2()     // 下载 MP4 + 封面 + 立即上传 R2
   - 'video_processed'  → extract-subtitle()       // 提取旁白(Apify 字幕优先,无则 ASR)
   - 'audio_extracted'  → analyze-gemini()         // 组装分析包 + 调 Gemini(传 R2 视频 URL)
   - 'analyzing'        → save-analysis-result()   // 保存结果
   - 'pending_analysis' → reset-and-restart()      // 重新分析

4. 成功 → 更新 status 到下一阶段
   失败 → status = 'failed'，记录 error_message

5. ⭐ 如果成功且不是终态（completed/failed/duplicate）：
   fetch(`${APP_URL}/api/cron/process`).catch(...)    // 接力棒

6. return { processed: 1, video_id, old_status, new_status }
```

`FOR UPDATE SKIP LOCKED` 防止 HTTP 调用链和前端兜底同时触发时处理同一条视频。

---

## 7. Handler 详细设计

### 7.1 fetch-metadata — 启动 Apify

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

### 7.2 poll-apify — 轮询 Apify 结果

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

### 7.3 upload-video-to-r2 — 调 Railway Worker 下载视频

**[v0.8 重写]** Apify 反爬升级后不返回直链,改为调 Railway Worker(yt-dlp)下载。

```
输入：video 记录（status = 'metadata_fetched'）
输出：videos.video_file_url + videos.cover_url 已更新为 R2 公开 URL
单步耗时：~8s（worker 同步下载 + 传 R2）

流程：
1. POST { url: video.webVideoUrl, r2Key: "{video_id}/video.mp4" } 到 Railway Worker
   （请求头带 X-Worker-Secret 鉴权）
2. Worker 用 yt-dlp 解析真实 mp4 → 下载 → 直接传 R2 → 返回 { r2Url, size }
3. 封面图：从 video.cover_url（Apify 已拿到）直接下载传 R2（小文件,web 服务自己做）
4. 更新 video_assets（mp4 + cover）+ videos.video_file_url / cover_url
5. status → video_processed

降级方案（worker 超时 / 视频不存在）：
- video_file_url 留空
- Gemini 分析只用封面图 + 字幕（画面理解降级,文案分析仍可用）
- status 仍走 video_processed（不阻塞流程）
```

### 7.4 ~~upload-to-r2~~ (v0.7 移除)

**[REMOVED since v0.7]** 逻辑已合并。v0.8 进一步合并进 Railway Worker 调用。

**[REMOVED since v0.7]** 逻辑已合并到 §7.3 `upload-video-to-r2`。原 Step 2(下载到 /tmp) + Step 3(上传 R2) 合并为一次 handler 调用,无 /tmp 中转。

### 7.5 extract-subtitle — 提取旁白/字幕

```
输入：video 记录（status = 'video_processed'）
输出：字幕文本(供 Gemini 分析时作辅助上下文)
单步耗时：~1s

流程：
1. 检查 Apify 数据中是否有字幕字段（textExtra）
2. 有 → 拼接为纯文本,INSERT video_assets (asset_type='subtitle')
3. 没有 → 文本降级:标题 + description + hashtags 拼接
4. status → audio_extracted
```

**v0.8 重要变更:不再用 Whisper ASR**。
实测 gemini-3.5-flash 通过 `video_url` 接收视频时,能同时理解画面 + 音频轨
(逐字转录口播 + 识别背景音乐),单独的 Whisper 转录是多余的。
Gemini 在 Step 4 自己"听"视频,这一步只负责补充 Apify 字幕(如有)作为辅助。

### 7.6 analyze-gemini — AI 分析(走 OpenRouter 传 R2 视频 URL)

```
输入：video 记录 + 元数据 + 旁白文本 + R2 视频 URL + 封面 URL
输出：结构化分析结果 JSON
单步耗时：~8s

流程：
1. 组装分析包（见第 8 节 Prompt 模板）
   - text: 旁白 + 元数据
   - video_url: R2 视频公开 URL（Gemini 看完整视频,画面+音频）
   - image_url: R2 封面 URL（辅助参考）
2. 调 OpenRouter chat/completions（gemini-3.5-flash）
3. 解析返回 JSON → INSERT INTO analysis_results
4. status → completed

为什么用 R2 视频 URL 而非 TikTok 源 URL：
- TikTok 源 URL 被风控/地区限制，Google fetch 经常失败
- R2(Cloudflare CDN)全球可达,Google 在 us-west 一定能 fetch
- 单次调用,完整视频理解（画面+音频+时间轴）,比抽帧准 N 倍
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

### 8.3 调用代码(OpenRouter 路径,传 R2 视频 URL)

```typescript
// lib/gemini/client.ts
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export async function analyzeVideo(input: AnalysisInput): Promise<AnalysisOutput> {
  if (process.env.MOCK_GEMINI === 'true') {
    return MOCK_ANALYSIS_RESULT
  }

  const model = process.env.GEMINI_MODEL || 'google/gemini-3.5-flash'

  // v0.7 关键变化:传 video_url 给 Gemini(R2 公开 URL),完整视频理解
  // image_url(封面)作为辅助参考
  const content: any[] = [
    { type: 'text', text: buildUserPrompt(input) },
  ]
  if (input.videoR2Url) {
    content.push({ type: 'video_url', video_url: { url: input.videoR2Url } })
  }
  if (input.coverR2Url) {
    content.push({ type: 'image_url', image_url: { url: input.coverR2Url } })
  }

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,  // 加大:完整视频分析输出更长
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter 返回空')

  return JSON.parse(text)
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
│   │   ├── upload-video-to-r2.ts   # Step 2: 下载 MP4 + 封面 → 立即上传 R2(v0.7 合并)
│   │   ├── extract-subtitle.ts     # Step 3: 提取旁白(v0.7 由 extract-audio 改名)
│   │   └── analyze-gemini.ts       # Step 4: Gemini 分析(结果写入也在末尾)
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
```

---

## 11. 环境变量

web 服务端(`.env.local`):

```bash
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
R2_PUBLIC_URL=                    # .r2.dev 开发域名(不含 bucket 名)或自定义域名

# Apify（TikTok 元数据抓取）
APIFY_API_KEY=
MOCK_APIFY=false                  # true = 走 Mock 数据

# Railway Worker（视频下载微服务,v0.8 新增）
RAILWAY_WORKER_URL=               # 例 https://tiktok-worker.up.railway.app
WORKER_SECRET=                    # 共享密钥,web 服务和 Worker 两边配一样的

# OpenRouter(统一 AI 网关,本期调 Gemini)
OPENROUTER_API_KEY=
GEMINI_MODEL=google/gemini-3.5-flash   # 支持 text+image+video+audio 全模态
MOCK_GEMINI=false                      # true = 走 Mock 数据

# 注:不需要 WHISPER_API_KEY —— gemini-3.5-flash 通过视频输入自带音频理解能力
```

Railway Worker 端(在 Railway Dashboard 配):

```bash
# R2 凭据(worker 直接传 R2,不经过 web 服务)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=tiktok-assets
R2_PUBLIC_URL=                    # 和 web 服务端一致

# 鉴权(web 服务请求头带 X-Worker-Secret,值要一致)
WORKER_SECRET=

# 可选:超时控制
MAX_VIDEO_SIZE_MB=50              # 超过的拒绝下载
DOWNLOAD_TIMEOUT_SEC=60           # yt-dlp 单视频超时
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
3. Settings → Public Access → 开启 Public Access(**v0.7 必开**,Gemini 要 fetch 视频 URL 理解内容)
4. 创建 API Token:R2 → Manage R2 API Tokens → 创建(权限:Object Read & Write)
5. 获取 `Access Key ID` + `Secret Access Key` + `Account ID`
6. 填入环境变量

### 12.3 Railway(主网站 web + 视频 worker)

> v0.9:主网站从 Vercel 迁到 Railway,和 worker 放同一个项目(内网通信 + 统一管理)。
> 完整部署步骤见 [`docs/deployment.md`](./deployment.md)。

**两个服务**(同一个 Railway 项目 `victorious-healing`):
- `web`(主网站 Next.js):6 页面 + 13 API + 4 cron,源码在仓库根目录
- `video-worker`(yt-dlp 下载):源码在 `worker/`

**部署关键点**:
1. web 用 Nixpacks 自动构建(根目录 package.json = Next.js)
2. worker 必须加 `RAILWAY_DOCKERFILE_FORCE=1` 强制用 Dockerfile(否则 Nixpacks 接管)
3. `NEXT_PUBLIC_APP_URL` 是构建时变量,域名生成后必须回填 + rebuild
4. 两个服务的 `WORKER_SECRET` 要一致(web 调 worker 时带)
5. web 的 `NODE_ENV=production` 让 cron 鉴权生效

**为什么不用 Vercel**:Vercel Hobby 10s 超时 + 无持久 FS,跑不了 yt-dlp。
全堆 Railway 后,worker 和 web 内网通信更快,一个平台管所有东西。

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
4. ~~每个视频关键帧只取 1–3 张（MVP 用封面图作为唯一帧）~~ (v0.7 删除:Gemini 直接看完整 R2 视频,不再单独抽关键帧)
5. 超过 60 秒的视频只分析前 60 秒
6. 用户点「重新分析」才新建 analysis_version 再次调 Gemini
7. 评论分析不放第一版
8. HTTP 调用链末尾 fetch 非阻塞，不增加用户等待时间
9. Mock 模式零外部调用（Apify 和 Gemini 都不花钱）
10. R2 零流量费（不需要担心反复查看视频和关键帧产生费用）
```

---

## 14. MVP 开发顺序

**开发顺序和任务清单以 [`docs/task.md`](./task.md) 为准**(Phase 1–5,每项含文件路径 + 验证标准)。本文档不重复列。

---

## 15. 架构图

```
用户浏览器
  │
  │  轮询每 3 秒 + 卡住时兜底触发
  ▼
┌──────────────────────────────────────────┐
│              Railway（web + worker）       │
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
│                    │    │  6 步接力       │
│                    │    └───────┘         │
└────────────────────┼─────────────────────┘
                     │
         ┌───────────┼───────────┬──────────────┐
         ▼           ▼           ▼              ▼
    ┌────────┐ ┌────────┐ ┌────────────┐ ┌────────────┐
    │Supabase│ │  Apify │ │ OpenRouter │ │  Railway   │
    │Postgres│ │ 元数据 │ │ → Gemini   │ │  Worker    │
    │ 状态机 │ │ 抓取   │ │ (base64视频)│ │ (yt-dlp下载)│
    └────────┘ └────────┘ └────────────┘ └──────┬─────┘
                                                │ 直接传
    ┌──────────────┐                           │
    │ Cloudflare R2│ ◄──────────────────────────┘
    │ MP4 + 封面    │
    └──────────────┘
```

---

## 16. 已知 Stub / 技术债(Phase 5 收尾登记)

以下是 Phase 1-5 完成后**已知未实现或简化处理**的部分,记录在此便于后续接手。

| 模块 | 现状 | 影响 | 计划 |
|------|------|------|------|
| `app/api/cron/refresh-metrics/route.ts` | v0.8 已接真实 Apify(重抓 completed 视频互动数),单次限 5 条控成本 | 大量视频时需多次触发 | 可加 cron 定时跑 |
| `app/api/cron/monitor-creators/route.ts` | v0.8 已接真实 Apify(`profiles` 抓取),按真实 `tiktok_video_id` 去重 | — | 已实现 |
| `app/api/cron/search-keywords/route.ts` | v0.8 已接真实 Apify(`searchQueries` 抓取),去重 | — | 已实现 |
| `lib/pipeline/extract-subtitle.ts` | v0.8 三级 fallback 已实现:Apify 字幕 → Whisper → 文本拼接 | TikTok 新版 `textExtra` 基本空,实际靠 Whisper/文本 | Whisper 受 10s 超时,大文件走降级 |
| `lib/pipeline/upload-video-to-r2.ts` | v0.8 改为调 Railway Worker(yt-dlp) | worker 超时 → video_file_url 留空,降级到封面+字幕分析 | 已实现 |
| Gemini 视频输入 | v0.8 用 base64 内联(OpenRouter 不支持任意 mp4 URL,只支持 YouTube+base64) | 大视频 base64 可能超 token 上限 | 短视频 OK,长视频可降级到封面 |
| RLS | 第一版所有表匿名可访问,无用户系统 | 任何人可读写 | 后续加 Supabase Auth + RLS 策略 |
| slideshow 视频 | TikTok `isSlideshow:true` 的视频是图片轮播,无 mp4 | worker 下不到文件,走封面降级 | TikTok 现状,无法绕过 |

**真实模式链路(v0.8)**:提交 → Apify 元数据 → Railway Worker 下视频 → R2 → Whisper 字幕 → Gemini(base64 视频)→ 分析结果。slideshow 视频走封面降级。

---

## 17. 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-07-03 | 初稿：总体结论、技术选型、数据库、页面 |
| v0.2 | 2026-07-03 | 异步处理模型、状态机、轮询策略 |
| v0.3 | 2026-07-03 | 完整 API 规格、Handler、Prompt、项目结构、部署 |
| v0.4 | 2026-07-03 | Hobby/Pro 双模式、HTTP 调用链详解、链断裂兜底 |
| v0.5 | 2026-07-03 | 确认方案 B:Vercel Hobby + Supabase + R2,存储从 Supabase Storage 迁移到 Cloudflare R2,移除 Pro 双模式冗余,聚焦 Hobby 7 步链路 |
| v0.6 | 2026-07-03 | Gemini 选型从 Google AI Studio 改为 OpenRouter(用户决定);删 tech.md 14 阶段列表(以 task.md 为准);加 task.md 交叉引用;关键帧策略明确"先用封面"是 MVP 简化决策 |
| v0.7 | 2026-07-03 | **关键变更:Gemini 视频输入改为传 R2 video URL**(完整视频理解,替代封面/MVP 简化);Pipeline 从 7 步合并为 6 步(下载+上传合一);删关键帧抽帧步骤;R2 bucket 强制 Public Access;extract-audio 改名为 extract-subtitle(明确 Apify 字幕优先 + ASR 降级);max_tokens 4096→8192(完整视频分析输出更长);**`video_downloaded` 状态标 [DEPRECATED]**,新流转直接跳过(metadata_fetched → video_processed),§7.3/§7.4 handler 合并为 `upload-video-to-r2` |
| v0.8 | 2026-07-04 | **真实化改造**:① Apify 实测反爬升级后 `downloadUrl` 失效,改字段映射(postURLs/profiles/searchQueries,mediaUrls,createTimeISO);② 新增 **Railway Worker**(yt-dlp 下载视频 → 传 R2),§7.3 handler 改为调 worker;③ Gemini 视频输入从"R2 URL"改为 **base64 内联**(OpenRouter 只支持 YouTube 链接 + base64,加 `input_modalities:['video']`);④ Whisper 独立 `lib/whisper/client.ts`,三级 fallback(Apify 字幕→Whisper→文本);⑤ 3 个 cron 端点接真实 Apify + 按真实 tiktok_id 去重;⑥ R2 公开 URL 格式修正(.r2.dev 不含 bucket 名);⑦ extract-subtitle 三级 fallback 实现 |
| v0.8.1 | 2026-07-04 | 模型统一回 `gemini-3.5-flash`(之前误改 2.5-flash);实测 3.5-flash 通过 video_url+base64 完美支持视频画面+音频理解;移除 `input_modalities`(加了反而偶尔 400) |
| v0.8.2 | 2026-07-04 | **移除 Whisper**:实测 Gemini 自身能逐字转录视频口播 + 识别音乐,Whisper 多余;extract-subtitle 改为 Apify 字幕(WEBVTT 解析)→ 文本降级;删 `lib/whisper/` + WHISPER_API_KEY |
| v0.8.3 | 2026-07-04 | **Apify 字幕下载**:实测发现 `videoMeta.subtitleLinks`(WEBVTT 格式 ASR 字幕,8 个视频 6 个有);extract-subtitle 加 `parseWebVtt` 解析,口播原文正确入库 |
| v0.9 | 2026-07-04 | **主网站部署到 Railway**(从 Vercel 迁移):web 服务(Next.js)+ video-worker 同一个项目内网通信;§12.3 重写;**安全加固**:cron 鉴权(`requireCronAuth`)+ Supabase RLS(6 表 anon 只读/禁写)+ 前端 task-list 改走 API(不裸查 DB);`docs/deployment.md` 全服务部署文档(含迁移 checklist) |
