/**
 * Railway Worker 客户端(视频下载微服务)
 *
 * Vercel 端调 worker:传 TikTok URL + R2 key,worker 用 yt-dlp 下载并传 R2,返回 r2Url。
 * worker 不在则降级(返回 null,handler 走封面+字幕分析)。
 *
 * tech.md §2.8: worker 是独立 Railway 服务,Vercel 通过 HTTP 调用。
 */

const DEFAULT_TIMEOUT_MS = 9000; // 留 1s 余量给 Hobby 10s 限制

export interface DownloadVideoResult {
  r2Url: string;
  size: number;
  sizeMB: number;
  durationSec: number | null;
}

/**
 * 调 worker 下载 TikTok 视频并传 R2
 *
 * @param tiktokUrl TikTok 视频页 URL(如 https://www.tiktok.com/@user/video/123)
 * @param r2Key R2 存储路径(如 "{video_id}/video.mp4")
 * @returns 成功返回 DownloadVideoResult;失败(未配 worker / 超时 / 视频不存在)返回 null
 */
export async function downloadVideoViaWorker(
  tiktokUrl: string,
  r2Key: string
): Promise<DownloadVideoResult | null> {
  const workerUrl = process.env.RAILWAY_WORKER_URL;
  const secret = process.env.WORKER_SECRET;

  // worker 未配置 → 直接降级(不影响链路,只是没视频画面)
  if (!workerUrl || !secret) {
    console.warn("[worker] RAILWAY_WORKER_URL 或 WORKER_SECRET 未配,跳过视频下载");
    return null;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": secret,
      },
      body: JSON.stringify({ url: tiktokUrl, r2Key }),
      signal: ctrl.signal,
    });

    const data = (await res.json()) as {
      r2Url?: string;
      size?: number;
      sizeMB?: number;
      durationSec?: number | null;
      error?: string;
      errorCode?: string;
    };

    if (!res.ok || !data.r2Url) {
      console.warn(
        `[worker] 下载失败 ${res.status}: ${data.errorCode || ""} ${data.error || ""}`
      );
      return null;
    }

    return {
      r2Url: data.r2Url,
      size: data.size ?? 0,
      sizeMB: data.sizeMB ?? 0,
      durationSec: data.durationSec ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[worker] 调用异常(超时/网络): ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * worker 是否可用(配了 URL + secret)
 */
export function isWorkerAvailable(): boolean {
  return !!process.env.RAILWAY_WORKER_URL && !!process.env.WORKER_SECRET;
}
