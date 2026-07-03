/**
 * TikTok Video Downloader Worker(Railway 部署)
 *
 * 职责:接收 { url, r2Key } → yt-dlp 解析下载 TikTok 视频 → 直接传 R2 → 返回 r2Url
 *
 * 为什么独立服务:yt-dlp 是二进制 + 频繁更新反反爬,Vercel serverless(10s 超时/无 FS)跑不了。
 *
 * 端点:
 *   GET  /health        — 健康检查
 *   POST /download      — 下载视频
 *     header: X-Worker-Secret: <WORKER_SECRET>
 *     body:   { url: string, r2Key: string }
 *     成功:   { r2Url, size, durationSec }
 *     失败:   { error, errorCode }  (4xx/5xx)
 *
 * env:
 *   WORKER_SECRET          — 共享密钥(和 Vercel 端一致)
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL
 *   MAX_VIDEO_SIZE_MB      — 默认 50,超过拒绝
 *   DOWNLOAD_TIMEOUT_SEC   — yt-dlp 单视频超时,默认 60
 *   PORT                   — Railway 自动注入
 */

import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: "1mb" }));

// ============================================================
// 配置
// ============================================================
const WORKER_SECRET = process.env.WORKER_SECRET;
const MAX_VIDEO_SIZE_MB = Number(process.env.MAX_VIDEO_SIZE_MB || 50);
const DOWNLOAD_TIMEOUT_SEC = Number(process.env.DOWNLOAD_TIMEOUT_SEC || 60);
const PORT = process.env.PORT || 3001;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ============================================================
// 鉴权中间件
// ============================================================
app.use((req, res, next) => {
  // /health 不鉴权
  if (req.path === "/health") return next();
  if (!WORKER_SECRET) {
    return res.status(500).json({ error: "WORKER_SECRET 未配置" });
  }
  const secret = req.headers["x-worker-secret"];
  if (secret !== WORKER_SECRET) {
    return res.status(401).json({ error: "鉴权失败", errorCode: "UNAUTHORIZED" });
  }
  next();
});

// ============================================================
// 健康检查
// ============================================================
app.get("/health", async (_req, res) => {
  // 顺带检查 yt-dlp 是否可用
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
    res.json({ ok: true, ytdlp: stdout.trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: "yt-dlp 不可用: " + e.message });
  }
});

// ============================================================
// 主端点:下载视频 + 传 R2
// ============================================================
app.post("/download", async (req, res) => {
  const { url, r2Key } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url 必填", errorCode: "BAD_REQUEST" });
  }
  if (!r2Key || typeof r2Key !== "string") {
    return res.status(400).json({ error: "r2Key 必填", errorCode: "BAD_REQUEST" });
  }
  if (!/tiktok\.com\//i.test(url)) {
    return res.status(400).json({ error: "url 必须是 TikTok 链接", errorCode: "BAD_REQUEST" });
  }

  const jobDir = join(tmpdir(), `tiktok-${randomUUID()}`);
  const outFile = join(jobDir, "video.mp4");

  try {
    await mkdir(jobDir, { recursive: true });

    // 1. yt-dlp 下载最佳 mp4(限制格式 + 大小 + 超时)
    //    -f "best[ext=mp4]" 优先 mp4,降级 best
    //    --max-filesize 限制大小
    //    --no-playlist 单视频
    const ytdlpArgs = [
      "-f", "best[ext=mp4]/best",
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--newline",
      "--max-filesize", `${MAX_VIDEO_SIZE_MB}M`,
      "-o", outFile,
      url,
    ];

    console.log(`[download] start: ${url} -> ${r2Key}`);
    const { stdout, stderr } = await execFileAsync("yt-dlp", ytdlpArgs, {
      timeout: DOWNLOAD_TIMEOUT_SEC * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr) console.log(`[yt-dlp stderr] ${stderr.slice(0, 500)}`);

    // 2. 读取下载的文件
    let buf;
    try {
      buf = await readFile(outFile);
    } catch {
      return res.status(404).json({
        error: "yt-dlp 未输出文件(视频可能不存在/被删/slideshow 无 mp4)",
        errorCode: "VIDEO_NOT_FOUND",
        ytdlpStderr: stderr?.slice(0, 300),
      });
    }

    const sizeMB = buf.length / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      return res.status(413).json({
        error: `视频过大 ${sizeMB.toFixed(1)}MB > ${MAX_VIDEO_SIZE_MB}MB`,
        errorCode: "VIDEO_TOO_LARGE",
      });
    }

    // 3. 上传 R2
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: buf,
        ContentType: "video/mp4",
      })
    );

    // 4. 拼公开 URL(.r2.dev 不含 bucket 名;S3 endpoint 风格含)
    const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    const bucket = process.env.R2_BUCKET_NAME;
    const r2Url = base.endsWith(`/${bucket}`)
      ? `${base}/${r2Key}`
      : `${base}/${r2Key}`;

    // 5. 从 yt-dlp 输出提取时长(可选,失败忽略)
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)/);
    const durationSec = durationMatch
      ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
      : null;

    console.log(`[download] done: ${r2Key} | ${sizeMB.toFixed(1)}MB`);
    res.json({
      r2Url,
      size: buf.length,
      sizeMB: Number(sizeMB.toFixed(2)),
      durationSec,
    });
  } catch (err) {
    console.error(`[download] error:`, err.message);
    const isTimeout = err.killed || /timed out/i.test(err.message);
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? `yt-dlp 超时(>${DOWNLOAD_TIMEOUT_SEC}s)` : err.message,
      errorCode: isTimeout ? "DOWNLOAD_TIMEOUT" : "DOWNLOAD_FAILED",
    });
  } finally {
    // 清理临时文件
    rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`worker listening on :${PORT}`);
});
