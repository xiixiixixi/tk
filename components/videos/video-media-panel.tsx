"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Hash,
  Heart,
  MessageCircle,
  Play,
  RotateCw,
  Share2,
  Sparkles,
  User,
  Video as VideoIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Divider, Muted, Numeric, P } from "@/components/ui/typography";
import {
  cn,
  formatCount,
  formatDateTime,
  formatDuration,
} from "@/lib/utils";
import type { VideoAssetRow, VideoDetail } from "@/lib/pipeline/types";

/**
 * 视频详情页顶部「视频素材区」
 *
 *   左边竖屏播放器,右边状态 + 原始互动数据 + 旁白 + 基础信息。
 *   不依赖 analysis_status — 解析完成 / 进行中 / 失败 都会渲染,
 *   让用户在等待 AI 分析时也能直接看视频与旁白原文。
 *
 *   failed 时提供一个「重新分析」按钮:
 *   调用 POST /api/tasks { task_type: 'analyze_video', input_value: original_url },
 *   后端走 dedup,失败视频会得到一条新的 task / video 记录开始重跑。
 */

interface VideoMediaPanelProps {
  video: VideoDetail;
}

// source_type → 中文标签
const SOURCE_LABELS: Record<string, string> = {
  manual_video: "手动提交",
  creator_monitor: "博主监控",
  keyword_search: "关键词搜索",
  hashtag_search: "话题搜索",
};

// 从 video_assets 找字幕(asset_type='subtitle',正文在 description 字段)
function findSubtitleAsset(
  assets: VideoAssetRow[]
): VideoAssetRow | undefined {
  return assets.find((a) => a.asset_type === "subtitle");
}

// 单个数据格(图标 + 数字 + 中文 label)— 编辑风格小标
interface MetricCellProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

function MetricCell({ icon, label, value }: MetricCellProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <div className="min-w-0">
        <Numeric className="block text-lg leading-none">{formatCount(value)}</Numeric>
        <Muted className="mt-1 block">{label}</Muted>
      </div>
    </div>
  );
}

export function VideoMediaPanel({ video }: VideoMediaPanelProps) {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const subtitle = findSubtitleAsset(video.video_assets);
  const subtitleText = subtitle?.description?.trim() || null;

  const canRetry = video.analysis_status === "failed";
  const isManualVideo = video.source_type === "manual_video";

  // failed → 调 /api/videos/:id/reanalyze 重置原视频状态,不建新记录
  const handleRetry = React.useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/reanalyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      // 重置成功,刷新页面让 server 重新渲染(进入 pending 状态 + 轮询)
      router.refresh();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "提交失败");
      setRetrying(false);
    }
  }, [video.id, router]);

  // manual_video → 软删除后回列表
  const handleDelete = React.useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      router.push("/videos");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除失败");
      setDeleting(false);
    }
  }, [video.id, router]);

  return (
    <section className="mx-auto max-w-6xl px-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[300px_1fr]">
        {/* ===== 左侧:视频播放器 ===== */}
        <div>
          <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            {video.video_file_url ? (
              <video
                src={video.video_file_url}
                controls
                poster={video.cover_url ?? undefined}
                preload="metadata"
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            ) : video.cover_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.cover_url}
                  alt={video.title ?? "视频封面"}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/70 px-3 py-2 text-xs text-zinc-100">
                  <Download className="h-3.5 w-3.5" />
                  视频未下载或下载失败
                </div>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-400">
                <VideoIcon className="h-8 w-8" />
                <span className="text-xs">无可用视频</span>
              </div>
            )}
          </div>

          {/* 原文外链(始终显示,只要有 URL) */}
          {video.original_url ? (
            <Link
              href={video.original_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              在 TikTok 打开原视频
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {/* ===== 右侧:状态 + 数据 + 旁白 + 基础信息 ===== */}
        <div className="min-w-0 space-y-8">
          {/* 状态行 */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={video.analysis_status} />
              <Muted className="font-mono uppercase tracking-[0.18em]">
                {video.analysis_status === "completed"
                  ? "Analyzed · 已解析"
                  : video.analysis_status === "failed"
                    ? "Failed · 解析失败"
                    : "Pending · 等待或处理中"}
              </Muted>
            </div>

            {video.analysis_status === "failed" && video.error_message ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">
                  {video.error_message}
                </span>
              </div>
            ) : null}

            {canRetry ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  <RotateCw
                    className={cn(retrying && "animate-spin")}
                  />
                  {retrying ? "提交中…" : "重新分析"}
                </Button>
                {retryError ? (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {retryError}
                  </span>
                ) : (
                  <Muted>
                    将重新创建一个分析任务,沿用原视频链接
                  </Muted>
                )}
              </div>
            ) : null}

            {/* manual_video → 直接删除;其他来源 → 引导到订阅页批量管理 */}
            {isManualVideo ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/30"
                >
                  删除视频
                </Button>
                <Muted>
                  仅手动提交的单个视频可直接删除
                </Muted>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Muted>
                  此视频来自{" "}
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {SOURCE_LABELS[video.source_type] ?? video.source_type}
                  </span>
                  ,请到对应的订阅页面取消订阅后批量删除
                </Muted>
              </div>
            )}
          </div>

          {/* 互动数据 5 列 */}
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-serif text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                原始互动数据
              </h2>
              <Muted className="font-mono uppercase tracking-[0.18em]">
                Metrics
              </Muted>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCell
                icon={<Eye className="h-4 w-4" />}
                label="播放"
                value={video.play_count}
              />
              <MetricCell
                icon={<Heart className="h-4 w-4" />}
                label="点赞"
                value={video.like_count}
              />
              <MetricCell
                icon={<MessageCircle className="h-4 w-4" />}
                label="评论"
                value={video.comment_count}
              />
              <MetricCell
                icon={<Share2 className="h-4 w-4" />}
                label="分享"
                value={video.share_count}
              />
              <MetricCell
                icon={<Sparkles className="h-4 w-4" />}
                label="收藏"
                value={video.collect_count}
              />
            </div>
          </div>

          {/* 完整旁白 */}
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-serif text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                完整旁白
              </h2>
              <Muted className="font-mono uppercase tracking-[0.18em]">
                Voiceover
              </Muted>
            </div>
            {subtitleText ? (
              <details
                className="group rounded-md border border-zinc-200 bg-white px-4 py-3 open:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:open:bg-zinc-900/50"
                open
              >
                <summary className="cursor-pointer list-none text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  展开 / 收起旁白全文
                </summary>
                <P className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {subtitleText}
                </P>
              </details>
            ) : (
              <div className="rounded-md border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-zinc-800">
                <Muted>暂无旁白文本 · 通常在视频下载与音频提取后生成</Muted>
              </div>
            )}
          </div>

          {/* 基础信息 */}
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-serif text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                基础信息
              </h2>
              <Muted className="font-mono uppercase tracking-[0.18em]">
                Meta
              </Muted>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">作者</dt>
                  <dd className="truncate text-zinc-900 dark:text-zinc-100">
                    {video.author_name ? `@${video.author_name}` : "未知"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">发布时间</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {video.publish_time ? formatDateTime(video.publish_time) : "—"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">时长</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {video.duration != null
                      ? formatDuration(video.duration)
                      : "—"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">来源</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {SOURCE_LABELS[video.source_type] ?? video.source_type}
                    {video.source_value ? (
                      <span className="ml-1.5 text-xs text-zinc-500">
                        · {video.source_value}
                      </span>
                    ) : null}
                    {video.source_type === "creator_monitor" ? (
                      <Link
                        href="/creators"
                        className="ml-2 text-xs font-medium text-[#C04A1A] underline-offset-4 hover:underline"
                      >
                        取消订阅
                      </Link>
                    ) : null}
                  </dd>
                </div>
              </div>
              {video.hashtags && video.hashtags.length > 0 ? (
                <div className="flex items-start gap-2.5 sm:col-span-2">
                  <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <div className="min-w-0">
                    <dt className="text-xs text-zinc-500">话题标签</dt>
                    <dd className="flex flex-wrap gap-1.5 pt-1">
                      {video.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>

      <Divider className="mt-12 md:mt-16" />

      {/* manual_video 删除确认 */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              确定删除这条视频?
            </DialogTitle>
            <DialogDescription asChild>
              <Muted>此操作不可撤销</Muted>
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="min-w-[96px] bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
