# TikTok Video Worker

视频下载微服务(yt-dlp + 传 R2),部署在 Railway。

**完整部署文档见 [`docs/deployment.md`](../docs/deployment.md)** —— 包含 CLI/网页两种部署方式、环境变量配置、验证步骤、踩坑记录、运维和故障排查。

## 快速本地测试

```bash
cd worker
npm install
WORKER_SECRET=test123 \
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
R2_BUCKET_NAME=tiktok-assets R2_PUBLIC_URL=https://xxx.r2.dev \
npm start
```

测试:
```bash
curl http://localhost:3001/health
```
