# Railway Worker 部署指南

> 视频下载微服务的完整部署文档。
> 架构背景见 [`tech.md`](./tech.md) §2.8,代码在 [`worker/`](../worker/) 目录。

---

## 1. 这是什么

一个独立的 Node 微服务,跑在 Railway 上,职责单一:

```
Vercel (Step 2 handler)
  │  POST { url, r2Key }  →  Railway Worker
  │                              │
  │                              ├ 1. yt-dlp 解析 TikTok URL → 拿真实 mp4 直链
  │                              ├ 2. 下载 mp4 到内存
  │                              └ 3. 用 R2 凭据上传到 {r2Key}
  │
  │  ← { r2Url, size, durationSec }
  ▼
```

**为什么独立**:yt-dlp 是二进制 + 频繁更新反反爬,Vercel Hobby serverless(10s 超时、无持久 FS)跑不了。Railway 常驻进程能装能跑。

---

## 2. 前置准备

| 需求 | 说明 |
|------|------|
| Railway 账号 | [railway.app](https://railway.app) 注册,绑信用卡(有 $5 试用额度,够测几百次) |
| GitHub 仓库 | worker 代码已 push 到 `worker/` 目录 |
| R2 bucket | `tiktok-assets` 已建,Public Access 已开 |
| R2 凭据 | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` |

---

## 3. 部署方式 A:CLI(推荐,最可靠)

### 3.1 安装 Railway CLI

```bash
npm install -g @railway/cli
railway --version   # 应输出 5.x.x
```

### 3.2 登录

```bash
railway login
# 自动打开浏览器 → 点 Authorize → 回终端显示 "Logged in as xxx"
```

### 3.3 部署 worker

```bash
cd worker
railway link -p <项目名> -e production   # 链接到已有项目(或交互选择)
railway up -y
```

> ⚠️ **关键**:必须在 `worker/` 目录里执行 `railway up`,Railway 会上传当前目录。
> 如果在项目根目录执行,会上传整个 Next.js 项目,部署会错。

首次部署会触发 Dockerfile 构建(装 yt-dlp + ffmpeg,约 3-5 分钟)。

### 3.4 生成公网域名

```bash
railway domain -s <服务名>
# 输出:Service domain created: https://xxx.up.railway.app
```

---

## 4. 部署方式 B:网页

1. Railway Dashboard → **New Project** → **Deploy from GitHub repo** → 选仓库
2. ⚠️ **必须设 Root Directory**:创建服务的配置窗口里找 **Advanced → Root Directory** → 填 `worker`
3. 等部署完成(Deployments 标签变绿色)
4. Settings → Networking → Generate Domain

> 如果网页版死活找不到 Root Directory 设置(界面改版),用上面的 CLI 方式,更可靠。

---

## 5. 配置环境变量(必须)

无论 CLI 还是网页部署,**都要配这 8 个变量**。

### CLI 方式(推荐)

```bash
railway variables set -s <服务名> \
  "WORKER_SECRET=<openssl rand -hex 32 生成的密钥>" \
  "R2_ACCOUNT_ID=<同 Vercel 端 .env.local>" \
  "R2_ACCESS_KEY_ID=<同 Vercel 端>" \
  "R2_SECRET_ACCESS_KEY=<同 Vercel 端>" \
  "R2_BUCKET_NAME=tiktok-assets" \
  "R2_PUBLIC_URL=<同 Vercel 端,.r2.dev 域名>" \
  "MAX_VIDEO_SIZE_MB=50" \
  "DOWNLOAD_TIMEOUT_SEC=60"
```

### 网页方式

服务 → **Variables** 标签 → 逐个添加,或用 Raw Editor 批量粘贴。

### 变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `WORKER_SECRET` | ✅ | 共享密钥,Vercel 和 Worker 两边配**完全一样**的值。生成:`openssl rand -hex 32` |
| `R2_ACCOUNT_ID` | ✅ | Cloudflare R2 账户 ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 API Token 的 Access Key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 API Token 的 Secret |
| `R2_BUCKET_NAME` | ✅ | `tiktok-assets` |
| `R2_PUBLIC_URL` | ✅ | R2 公开域名,如 `https://pub-xxx.r2.dev`。⚠️ **不含 bucket 名** |
| `MAX_VIDEO_SIZE_MB` | 可选 | 超过的视频拒绝下载,默认 50 |
| `DOWNLOAD_TIMEOUT_SEC` | 可选 | yt-dlp 单视频超时,默认 60 |

### 同步 Vercel 端

Worker 配好后,在 Vercel 项目的 `.env.local`(或 Vercel dashboard)加:

```bash
RAILWAY_WORKER_URL=https://xxx.up.railway.app   # Worker 的公网域名
WORKER_SECRET=<和 Worker 端完全一样的密钥>
```

---

## 6. 验证部署

### 6.1 健康检查

```bash
curl https://你的worker域名.up.railway.app/health
```

期望返回:
```json
{"ok":true,"ytdlp":"2026.06.09"}
```

- `ok:true` = Express 服务正常
- `ytdlp` = yt-dlp 版本号(确认装上了)

如果返回 `{"ok":false,"error":"yt-dlp 不可用..."}`,看 Deployments 日志排查 Dockerfile 构建。

### 6.2 测真实下载

```bash
curl -X POST https://你的worker域名.up.railway.app/download \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: <你的密钥>" \
  -d '{"url":"https://www.tiktok.com/@某博主/video/某视频ID","r2Key":"test/video.mp4"}' \
  --max-time 90
```

期望返回:
```json
{"r2Url":"https://pub-xxx.r2.dev/test/video.mp4","size":2003903,"sizeMB":1.91,"durationSec":null}
```

### 6.3 验证 R2 文件可访问

```bash
curl -sI https://pub-xxx.r2.dev/test/video.mp4 | grep -i content-type
# 应返回 Content-Type: video/mp4
```

---

## 7. 端点说明

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/health` | 无 | 健康检查 + yt-dlp 版本 |
| POST | `/download` | `X-Worker-Secret` 头 | 下载视频 + 传 R2 |

### `/download` 请求/响应

**请求**:
```json
{
  "url": "https://www.tiktok.com/@user/video/123",  // 必填,TikTok 视频页 URL
  "r2Key": "{video_id}/video.mp4"                    // 必填,R2 存储路径
}
```

**成功** (200):
```json
{
  "r2Url": "https://pub-xxx.r2.dev/{video_id}/video.mp4",
  "size": 2003903,
  "sizeMB": 1.91,
  "durationSec": 15
}
```

**失败** (4xx/5xx):
```json
{
  "error": "yt-dlp 未输出文件(视频可能不存在/slideshow)",
  "errorCode": "VIDEO_NOT_FOUND"
}
```

| errorCode | 含义 |
|-----------|------|
| `UNAUTHORIZED` | `WORKER_SECRET` 不匹配 |
| `BAD_REQUEST` | `url` 或 `r2Key` 缺失/格式错 |
| `VIDEO_NOT_FOUND` | yt-dlp 没下到文件(视频删了/私密/slideshow 无 mp4) |
| `VIDEO_TOO_LARGE` | 超过 `MAX_VIDEO_SIZE_MB` |
| `DOWNLOAD_TIMEOUT` | yt-dlp 超过 `DOWNLOAD_TIMEOUT_SEC` |
| `DOWNLOAD_FAILED` | 其他下载错误 |

---

## 8. 日常运维

### 更新代码后重新部署

```bash
cd worker
railway up -y
```

(如果用 GitHub 自动部署,`git push` 后 Railway 会自动重新部署)

### 看日志

```bash
railway logs -s <服务名>
# 实时日志,Ctrl+C 退出
```

### 查看状态

```bash
railway status
# status: ● Online = 正常
# status: ● Deploying = 构建中
# status: ● Failed = 部署失败,看 logs
```

### 更新 yt-dlp(反反爬失效时)

TikTok 反爬更新后 yt-dlp 可能下载失败。Dockerfile 里用 `latest`,重新部署即更新:

```bash
cd worker
railway up -y   # 触发重建,拉最新 yt-dlp
```

如果 latest 也不行,改 Dockerfile 里 yt-dlp 的 release URL 到具体版本:
```dockerfile
&& curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp ...
```

---

## 9. 踩坑记录(实测遇到)

### 坑 1:Railway 默认用 Nixpacks,忽略 Dockerfile

**现象**:从 `worker/` 目录 `railway up` 后,日志显示 `next start`(Next.js),不是 worker。

**原因**:Railway 的 Nixpacks 检测到 `package.json` 就自动构建,忽略 Dockerfile。

**解决**:加环境变量强制用 Dockerfile:
```bash
railway variables set -s <服务名> "RAILWAY_DOCKERFILE_FORCE=1"
```

或确保从纯净的 `worker/` 目录部署(目录里只有 worker 的 4 个文件,无 Next.js package.json 干扰)。

### 坑 2:curl 证书校验失败

**现象**:Dockerfile 构建时报 `curl: (77) error setting certificate file`。

**原因**:`node:20-slim` 基础镜像没装 ca-certificates,curl HTTPS 请求证书校验失败。

**解决**:Dockerfile 里**先装 ca-certificates 再 curl**:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \    # ← 必须在 curl 之前装
    ffmpeg curl python3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/...
```

### 坑 3:Root Directory 设不生效

**现象**:网页设了 Root Directory = `worker`,但部署的还是 Next.js。

**解决**:用 CLI(方式 A)部署,在 `worker/` 目录里执行 `railway up`,绕过网页 Root Directory 设置。

---

## 10. 成本

| 项 | 说明 |
|----|------|
| Railway | $5 试用额度,之后按用量计分。Worker 是常驻小服务,内存占用低,实测约 $5/月 |
| R2 流量 | $0(worker 上传 + Gemini 下载都走 R2,免流量费) |
| yt-dlp | 免费 |

每次视频下载约消耗:几秒 CPU + 几 MB 出站流量(到 R2)。$5 额度大约能下几千个视频。

---

## 11. 故障排查

### worker health 返回 500 / yt-dlp 不可用

```bash
railway logs -s <服务名> | grep -i "yt-dlp\|docker\|build"
```

看 Dockerfile 构建是否成功。常见:GitHub release URL 改了(改 Dockerfile 里的 URL)。

### 下载一直 VIDEO_NOT_FOUND

```bash
# 本地装 yt-dlp 测同一个视频
brew install yt-dlp  # 或 npm i -g yt-dlp
yt-dlp "https://www.tiktok.com/@user/video/123"
```

- 本地也失败 = TikTok 反爬更新,升级 yt-dlp(见 §8)
- 本地成功但 worker 失败 = worker 地区被限,在 Railway 改部署 region

### Vercel 调 worker 超时

worker 默认同步等待(最长 60s)。短视频(<10MB)通常 5-8s 完成,长视频可能超时。

Vercel 端 `lib/worker/client.ts` 设了 9s 超时(留余量给 Hobby 10s 限制),超过会降级(视频留空,走封面+字幕分析)。这是设计内的降级,不是 bug。

如果需要处理长视频,改 `DOWNLOAD_TIMEOUT_SEC` 和 client 超时,但要注意 Vercel Hobby 10s 硬限制。
