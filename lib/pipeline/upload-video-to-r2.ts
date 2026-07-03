import { uploadToR2, getR2PublicUrl } from "@/lib/r2/client";
import { insertVideoAsset, updateVideo } from "@/lib/supabase/queries";
import { getRunDataset, shouldUseApifyMock } from "@/lib/apify/client";
import type { VideoRow, VideoUpdate } from "@/lib/pipeline/types";
import type { AnalysisStatus } from "@/types";

/**
 * Pipeline Step 2: 下载 MP4 + 封面 → 上传 R2
 *
 * - 优先从 apify_run_id 拉取 dataset,获取 videoMeta.downloadUrl / coverUrl
 * - 降级:从 video.original_url / video.cover_url 取
 * - MP4 不可用时只下封面,video_file_url 留空
 * - 错误一律 throw,由 cron process 标 'failed'
 */
export default async function uploadVideoToR2(
  video: VideoRow
): Promise<{ nextStatus: AnalysisStatus; extra?: Partial<VideoUpdate> }> {
  // 1) 拿真实的 MP4 / 封面 URL
  let videoUrl: string | undefined;
  let coverUrl: string | undefined;

  if (video.apify_run_id) {
    try {
      const dataset = await getRunDataset(video.apify_run_id);
      const first = dataset?.[0];
      videoUrl = first?.videoMeta?.downloadUrl || undefined;
      coverUrl = first?.videoMeta?.coverUrl || coverUrl;
    } catch (err) {
      // apify 拉失败不致命,继续走降级路径
      console.warn(`[upload-video-to-r2] apify dataset 拉取失败:`, err);
    }
  }

  if (!videoUrl) videoUrl = video.original_url ?? undefined;
  if (!coverUrl) coverUrl = video.cover_url ?? undefined;

  // Mock 模式:input TikTok URL 不是直接视频,跳过 MP4 下载,
  // 保留 fetch-metadata 阶段已写入的 cover_url(来自 mockApifyVideo)
  if (shouldUseApifyMock()) {
    return { nextStatus: "video_processed" };
  }

  const mp4Key = `${video.id}/video.mp4`;
  const coverKey = `${video.id}/cover.jpg`;

  // 2) 下载 + 上传 MP4(降级时跳过)
  let videoFileUrl: string | null = null;
  if (videoUrl) {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`MP4 下载失败: ${res.status} ${videoUrl}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await uploadToR2(mp4Key, buf, "video/mp4");
    videoFileUrl = getR2PublicUrl(mp4Key);
    await insertVideoAsset(video.id, "mp4", videoFileUrl, "原始视频文件");
  }

  // 3) 下载 + 上传 封面
  let coverPublicUrl: string | null = null;
  if (coverUrl) {
    const res = await fetch(coverUrl);
    if (!res.ok) {
      throw new Error(`封面下载失败: ${res.status} ${coverUrl}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await uploadToR2(coverKey, buf, "image/jpeg");
    coverPublicUrl = getR2PublicUrl(coverKey);
    await insertVideoAsset(video.id, "cover", coverPublicUrl, "视频封面");
  }

  // 4) 写回 videos 行
  const patch: VideoUpdate = {
    video_file_url: videoFileUrl,
    cover_url: coverPublicUrl ?? video.cover_url ?? null,
  };
  await updateVideo(video.id, patch);

  return { nextStatus: "video_processed", extra: patch };
}
