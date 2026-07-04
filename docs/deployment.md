# 部署指南(全服务)

> 本项目所有服务的完整部署文档。作为**生产环境运维 + 迁移依据**。
> 技术架构见 [`tech.md`](./tech.md),开发任务见 [`task.md`](./task.md)。

---

## 1. 服务总览

本项目由 **6 个服务** 组成,分布在不同平台:

| # | 服务 | 平台 | 用途 | 月成本 |
|---|------|------|------|--------|
| 1 | **web**(主网站) | Railway | Next.js:6 个页面 + 13 个 API + 4 个 cron | ~$5 |
| 2 | **video-worker**(视频下载) | Railway | Node + yt-dlp:下载 TikTok 视频 → 传 R2 | ~$5(共享 web 额度) |
| 3 | **Postgres 数据库** | Supabase | 6 张表 + RLS + RPC 函数 | $0(500MB 免费) |
| 4 | **文件存储** | Cloudflare R2 | MP4 + 封面(公开可读) | $0(10GB + 免流量) |
| 5 | **TikTok 抓取** | Apify | 元数据 + 字幕(`clockworks/tiktok-scraper`) | 按量(~$0.00025/次) |
| 6 | **AI 分析** | OpenRouter | Gemini 3.5 Flash(画面+音频+文本) | 按量(~$0.001/次) |

**架构图**:
```
用户浏览器 → web 服务(Railway,Next.js)
              │
              ├→ Supabase(数据库,RLS 锁权限)
              ├→ Apify(抓元数据 + ASR 字幕)
              ├→ video-worker(Railway,yt-dlp 下载视频)
              │     └→ R2(存 MP4 + 封面,公开可读)
              └→ OpenRouter → Gemini(base64 视频画面+音频分析)
```

---

## 2. Railway 项目结构

两个服务在**同一个 Railway 项目**里(内网通信,省流量):

```
项目:victorious-healing  (ID: a159433a-4a79-48c5-8d90-cdac8b713826)
  ├─ 服务 video-worker  (ID: cc54aabb-937b-40b8-8dbf-e4fde45b1786)
  │   URL: https://victorious-healing-production-8d04.up.railway.app
  │   源码目录: worker/
  │
  └─ 服务 web  (ID: bad48ff7-4380-4082-ac81-3ac5fa9af824)
      URL: https://web-production-7b0eb3.up.railway.app
      源码目录: /(项目根)
```

> ⚠️ `victorious-healing` 是 Railway 随机生成的项目名,worker 服务沿用了这个名字(历史原因)。
> 项目/服务改名不影响功能,但会改变域名,需要同步更新所有 URL 配置。

---

## 3. 前置准备

### 3.1 账号 + 凭据

| 平台 | 需要拿到 | 在哪拿 |
|------|---------|--------|
| Railway | API token(或 OAuth 登录 CLI) | railway.app/account/tokens |
| Supabase | URL + anon key + service_role key + PAT | supabase.com/dashboard → Settings → API |
| Cloudflare R2 | account_id + access_key_id + secret_access_key | dash.cloudflare.com → R2 → Manage API Tokens |
| Apify | API key | console.apify.com → Settings → Integrations |
| OpenRouter | API key | openrouter.ai/keys |

### 3.2 GitHub 仓库

代码在 `xiixiixixi/tk`,两个服务的源码:
- `worker/` → video-worker 服务
- `/`(根目录)→ web 服务

### 3.3 安装 Railway CLI

```bash
npm install -g @railway/cli
railway login   # 浏览器授权
```

---

## 4. 部署 web 服务(主网站)

### 4.1 创建服务

Railway CLI 没有 `service create` 命令(功能缺失),用 GraphQL 创建:

```bash
# 从 ~/.railway/config.json 拿 accessToken
TOKEN="<railway access token>"
PROJECT="a159433a-4a79-48c5-8d90-cdac8b713826"

curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { serviceCreate(input: { name: \\\"web\\\", projectId: \\\"$PROJECT\\\" }) { id name } }\"}"
```

> 如果项目还不存在,先在 Railway 网页创建项目。

### 4.2 配环境变量

```bash
railway link -p victorious-healing -e production -s web

# 从本地 .env.local 批量设(排除敏感/本地用的)
grep -E "^[A-Z_]+=." .env.local | grep -vE "^(MOCK_|SUPABASE_PAT|SUPABASE_DB|SUPABASE_PROXY|CLOUDFLARE|APIFY_PROXY)" | while IFS='=' read -r key val; do
  railway variables set -s web "$key=$val"
done

# 关键:NODE_ENV=production 让 cron 鉴权生效
railway variables set -s web "NODE_ENV=production"
```

**web 服务的环境变量清单**:

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_APP_URL` | web 的公网域名(部署后生成,**改了要 rebuild**) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 前端用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端(绕过 RLS) |
| `APIFY_API_KEY` | Apify 抓取 |
| `OPENROUTER_API_KEY` / `GEMINI_MODEL` | Gemini 分析 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | R2 上传封面 |
| `RAILWAY_WORKER_URL` / `WORKER_SECRET` | 调 video-worker 下视频 |
| `CRON_SECRET` | cron 端点鉴权 |
| `NODE_ENV` | `production`(开 cron 鉴权) |

### 4.3 部署 + 生成域名

```bash
railway up -y -s web
railway domain -s web
# 输出: https://web-production-xxx.up.railway.app
```

### 4.4 回填域名(必须!)

`NEXT_PUBLIC_*` 是构建时变量,域名生成后必须回填 + rebuild:

```bash
WEB_URL=$(railway domain list -s web | grep railway.app | awk '{print $1}')
railway variables set -s web "NEXT_PUBLIC_APP_URL=https://$WEB_URL"
# 自动触发 rebuild,等 ~3 分钟
```

### 4.5 验证

```bash
curl -sI https://web-production-xxx.up.railway.app         # 应 200
curl -s https://web-production-xxx.up.railway.app/api/tasks?limit=1   # 应返回 JSON
# cron 鉴权:无 secret 应 401,带 secret 应 200
curl -o /dev/null -w "%{http_code}" https://web-production-xxx.up.railway.app/api/cron/process  # 401
curl -o /dev/null -w "%{http_code}" -H "X-Cron-Secret: $CRON_SECRET" https://web-production-xxx.up.railway.app/api/cron/process  # 200
```

---

## 5. 部署 video-worker 服务

### 5.1 创建服务

```bash
# GraphQL 创建(同 web)
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { serviceCreate(input: { name: \\\"video-worker\\\", projectId: \\\"$PROJECT\\\" }) { id name } }\"}"

railway link -p victorious-healing -e production -s video-worker
```

### 5.2 配环境变量

```bash
railway variables set -s video-worker \
  "WORKER_SECRET=658c5cd75152bb757cf5f21d26a5b6b20dfc3b89d2236f3a1b2cd2d50d17d423" \
  "R2_ACCOUNT_ID=<同 web>" \
  "R2_ACCESS_KEY_ID=<同 web>" \
  "R2_SECRET_ACCESS_KEY=<同 web>" \
  "R2_BUCKET_NAME=tiktok-assets" \
  "R2_PUBLIC_URL=<同 web,.r2.dev 域名>" \
  "MAX_VIDEO_SIZE_MB=50" \
  "DOWNLOAD_TIMEOUT_SEC=60"
```

> ⚠️ worker 需要加 `RAILWAY_DOCKERFILE_FORCE=1`,否则 Nixpacks 会忽略 Dockerfile(见坑 1)。

### 5.3 部署 + 域名

```bash
cd worker
railway up -y -s video-worker
railway domain -s video-worker
```

### 5.4 同步 web 服务的 RAILWAY_WORKER_URL

```bash
WORKER_URL=$(railway domain list -s video-worker | grep railway.app | awk '{print $1}')
railway variables set -s web "RAILWAY_WORKER_URL=https://$WORKER_URL"
```

### 5.5 验证

```bash
curl https://video-worker-xxx.up.railway.app/health
# 应返回 {"ok":true,"ytdlp":"2026.x.x"}
```

---

## 6. Supabase 数据库

### 6.1 创建项目

[supabase.com](https://supabase.com) → New Project → 拿 URL + anon key + service_role key

### 6.2 执行 migration(4 个)

按顺序执行(网页 SQL Editor,或 Management API):

```bash
PAT="<supabase_pat>"
REF="<project_ref>"  # URL 里 https://xxx.supabase.co 的 xxx

for f in supabase/migrations/000*.sql; do
  echo "执行 $f"
  curl -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
    -d "$(jq -Rs '{query: .}' < "$f")"
done
```

| 文件 | 内容 |
|------|------|
| `00001_init.sql` | 6 张表 + 索引 + 触发器 |
| `00002_get_next_pending_video.sql` | 调度器 RPC(`FOR UPDATE SKIP LOCKED`) |
| `00003_videos_error_message.sql` | videos 加 error_message 列 |
| `00004_rls_policies.sql` | RLS 策略 + REVOKE(anon 只读,防删库) |

### 6.3 验证 RLS

```bash
# anon 写应被拒(401)
curl -X POST "$SUPABASE_URL/rest/v1/tasks" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_type":"test","input_value":"x"}'   # 期望 401

# anon 读 videos 应成功(只读)
curl "$SUPABASE_URL/rest/v1/videos?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"   # 期望 200
```

---

## 7. video-worker 端点说明

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/health` | 无 | 健康检查 + yt-dlp 版本 |
| POST | `/download` | `X-Worker-Secret` 头 | 下载视频 + 传 R2 |

### `/download` 请求/响应

**请求**:
```json
{ "url": "https://www.tiktok.com/@user/video/123", "r2Key": "{video_id}/video.mp4" }
```

**成功** (200):
```json
{ "r2Url": "https://pub-xxx.r2.dev/{video_id}/video.mp4", "size": 2003903, "sizeMB": 1.91, "durationSec": 15 }
```

**错误码**:

| errorCode | 含义 |
|-----------|------|
| `UNAUTHORIZED` | `WORKER_SECRET` 不匹配 |
| `BAD_REQUEST` | url/r2Key 缺失 |
| `VIDEO_NOT_FOUND` | yt-dlp 没下到(视频删了/slideshow) |
| `VIDEO_TOO_LARGE` | 超 `MAX_VIDEO_SIZE_MB` |
| `DOWNLOAD_TIMEOUT` | yt-dlp 超时 |
| `DOWNLOAD_FAILED` | 其他错误 |

---

## 8. Cloudflare R2

### 8.1 创建 bucket

1. [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → Create bucket → 名字 `tiktok-assets`
2. Settings → Public Access → **开启**(Gemini 要 fetch)

### 8.2 API Token

R2 → Manage R2 API Tokens → Create(权限:Object Read & Write)→ 拿 Access Key ID / Secret / Account ID

### 8.3 公开 URL 格式

```
.r2.dev 开发域名(不含 bucket 名):https://pub-xxx.r2.dev/{key}
S3 endpoint 风格(含 bucket 名):https://{account}.r2.cloudflarestorage.com/tiktok-assets/{key}
```

`getR2PublicUrl()` 自动适配两种格式。

---

## 9. 日常运维

### 更新代码后重新部署

```bash
cd /path/to/tk && railway up -y -s web           # web
cd worker && railway up -y -s video-worker       # worker
```

> 推荐连 GitHub 仓库,`git push` 自动部署。

### 看日志

```bash
railway logs -s web
railway logs -s video-worker   # Ctrl+C 退出
```

### 更新 yt-dlp(TikTok 反爬失效时)

Dockerfile 用 `latest`,重新部署即更新:

```bash
cd worker && railway up -y -s video-worker   # 触发重建,拉最新 yt-dlp
```

### 改环境变量

```bash
railway variables set -s web "KEY=value"
# 改 NEXT_PUBLIC_* 会触发 rebuild(构建时变量)
```

---

## 10. 踩坑记录(实测)

### 坑 1:Railway Nixpacks 忽略 Dockerfile

**现象**:worker 目录 `railway up` 后跑 Next.js,不是 worker。
**原因**:Nixpacks 检测 package.json 自动构建,忽略 Dockerfile。
**解决**:worker 服务加 `RAILWAY_DOCKERFILE_FORCE=1` 环境变量。

### 坑 2:curl 证书校验失败

**现象**:worker Dockerfile 构建报 `curl: (77) error setting certificate file`。
**解决**:Dockerfile 先装 `ca-certificates` 再 curl(见 `worker/Dockerfile`)。

### 坑 3:CLI 无法创建服务

**现象**:`railway service create/add/new` 全报错。
**原因**:Railway CLI 没有创建服务的命令。
**解决**:用 GraphQL API(见 §4.1 / §5.1)。

### 坑 4:NEXT_PUBLIC_APP_URL 改了不生效

**原因**:`NEXT_PUBLIC_*` 构建时注入,改环境变量后必须 rebuild。
**解决**:改完变量 Railway 自动 rebuild,等 ~3 分钟。

### 坑 5:Apify downloadUrl 失效

**现象**:`videoMeta.downloadUrl` 永远空。
**原因**:TikTok 反爬升级。
**解决**:改用 Railway worker(yt-dlp),见 tech.md §7.3。

### 坑 6:Gemini 视频 URL 400

**现象**:传 R2 视频 URL 给 Gemini 返回 INVALID_ARGUMENT。
**原因**:OpenRouter 的 Gemini 不支持任意 mp4 URL(只支持 YouTube + base64)。
**解决**:视频走 base64 内联。

---

## 11. 迁移 Checklist

迁移到新账号/平台,按此顺序避免依赖断裂:

- [ ] **1. Supabase**:新项目 → 跑 4 个 migration → 验证 RLS → 拿新 URL/anon/service key
- [ ] **2. R2**:新 bucket → 开 Public Access → 拿新凭据
- [ ] **3. Apify / OpenRouter**:复用现有 key 或新建
- [ ] **4. Railway worker**:创建服务 → 配 R2 凭据 + WORKER_SECRET + RAILWAY_DOCKERFILE_FORCE → 部署 → 拿新域名 → 验证 /health
- [ ] **5. Railway web**:创建服务 → 配全部环境变量(含 worker 新域名)→ 部署 → 拿新域名
- [ ] **6. 回填**:web 的 `NEXT_PUBLIC_APP_URL`(web 域名)+ `RAILWAY_WORKER_URL`(worker 域名)
- [ ] **7. 验证**:访问 web 域名 → 提交视频 → 全链路跑通
- [ ] **8. 旧资源**:确认新环境正常后清理旧的

---

## 12. 成本估算

| 服务 | 月成本 | 说明 |
|------|--------|------|
| Railway(web + worker) | ~$5 | 共享额度,小流量够用 |
| Supabase | $0 | 500MB 免费 |
| R2 | $0 | 10GB + 免流量 |
| Apify | ~$1-5 | ~$0.00025/视频 |
| OpenRouter | ~$1-5 | ~$0.001/视频 |
| **合计** | **~$7-15/月** | 取决于使用量 |
