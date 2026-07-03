# TikTok Video Worker(Railway)

独立微服务:用 yt-dlp 下载 TikTok 视频并传到 Cloudflare R2。

Vercel Hobby serverless 跑不了 yt-dlp(二进制 + 反反爬频繁更新),所以放 Railway 常驻进程,Vercel 通过 HTTP 调用。

## 部署到 Railway

### 1. 新建服务
- Railway Dashboard → New Project → Deploy from GitHub repo → 选这个仓库
- **Root Directory 设为 `worker/`**(Railway 会读 `worker/Dockerfile`)

### 2. 配环境变量(Settings → Variables)
```
WORKER_SECRET=<自己生成一个随机串,和 Vercel 端一致>
R2_ACCOUNT_ID=<同 Vercel 端>
R2_ACCESS_KEY_ID=<同 Vercel 端>
R2_SECRET_ACCESS_KEY=<同 Vercel 端>
R2_BUCKET_NAME=tiktok-assets
R2_PUBLIC_URL=<同 Vercel 端,.r2.dev 开发域名>
MAX_VIDEO_SIZE_MB=50
DOWNLOAD_TIMEOUT_SEC=60
```

### 3. 拿到公网 URL
部署成功后 Railway 给一个 URL,例:`https://tiktok-worker.up.railway.app`
填到 Vercel 端的 `RAILWAY_WORKER_URL`。

### 4. 验证
```bash
curl https://tiktok-worker.up.railway.app/health
# 应返回 {"ok":true,"ytdlp":"2024.x.x"}
```

## 本地测试
```bash
cd worker
npm install
WORKER_SECRET=test123 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET_NAME=tiktok-assets R2_PUBLIC_URL=https://xxx.r2.dev \
  npm start
```
