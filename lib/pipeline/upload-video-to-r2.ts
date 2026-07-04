import { uploadToR2, getR2PublicUrl } from "@/lib/r2/client";
import { insertVideoAsset, updateVideo } from "@/lib/supabase/queries";
import { getRunDataset, shouldUseApifyMock } from "@/lib/apify/client";
import { extractCoverUrl } from "@/lib/apify/mapper";
import { downloadVideoViaWorker } from "@/lib/worker/client";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

/**
 * Pipeline Step 2: 调 Railway Worker 下载视频 + 上传封面到 R2
 *
 * v0.8:Apify 反爬升级后拿不到视频直链,改为调 Railway Worker(yt-dlp)下载视频。
 *   - 视频:POST { url, r2Key } 到 worker → worker 用 yt-dlp 下 → 传 R2 → 返回 r2Url
 *   - 封面:从 Apify dataset 拿 coverUrl → Next.js 端自己下载传 R2(小文件)
 *
 * 降级:
 *   - worker 失败/超时/未配 → video_file_url 留空,Gemini 用封面+字幕分析
 *   - Mock 模式 → 直接跳过(用 mockApifyVideo 的 picsum 封面)
 */
export default async function uploadVideoToR2(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  const mp4Key = `${video.id}/video.mp4`;
  const coverKey = `${video.id}/cover.jpg`;

  // 1. 调 worker 下载视频(Mock 模式跳过)
  let videoFileUrl: string | null = null;
  if (!shouldUseApifyMock()) {
    // 用 canonical_url(webVideoUrl)给 worker,这是 TikTok 视频页 URL
    const tiktokUrl = video.canonical_url || video.original_url;
    if (tiktokUrl) {
      const result = await downloadVideoViaWorker(tiktokUrl, mp4Key);
      if (result) {
        videoFileUrl = result.r2Url;
        await insertVideoAsset(video.id, "mp4", videoFileUrl, `原始视频 ${result.sizeMB}MB`);
      }
      // result 为 null = 降级,videoFileUrl 留空,不阻塞
    }
  }

  // 2. 封面:从 Apify dataset 拿 coverUrl,下载传 R2
  let coverPublicUrl: string | null = video.cover_url ?? null;
  let coverSource: "r2" | "apify" | "none" = "none";

  if (video.apify_run_id) {
    try {
      const dataset = await getRunDataset(video.apify_run_id);
      const first = dataset.find((d) => !d.error && d.id === video.tiktok_video_id) ?? dataset.find((d) => !d.error);
      const coverUrl = first ? extractCoverUrl(first) : null;

      if (coverUrl) {
        try {
          const res = await fetch(coverUrl);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            await uploadToR2(coverKey, buf, "image/jpeg");
            coverPublicUrl = getR2PublicUrl(coverKey);
            coverSource = "r2";
            await insertVideoAsset(video.id, "cover", coverPublicUrl, "视频封面");
          } else {
            coverSource = "apify"; // R2 上传失败,直接用 Apify 原始 URL
          }
        } catch {
          coverSource = "apify"; // 下载/上传失败,降级用原始 URL
        }
      }
    } catch (err) {
      console.warn(`[upload-video-to-r2] apify dataset 拉取失败:`, err);
    }
  }

  // 3. 写回 videos 行
  const patch: VideoUpdate = {
    video_file_url: videoFileUrl,
    cover_url: coverPublicUrl,
  };
  await updateVideo(video.id, patch);

  console.log(
    `[upload-video-to-r2] video=${video.id.slice(0, 8)} mp4=${videoFileUrl ? "有" : "降级"} cover=${coverSource}`
  );

  return { nextStatus: "video_processed", extra: patch };
}
