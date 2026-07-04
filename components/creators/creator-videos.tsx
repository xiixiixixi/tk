"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Numeric, Muted } from "@/components/ui/typography";
import { StatusBadge } from "@/components/tasks/status-badge";
import {
  DEFAULT_VIDEO_FILTERS,
  ListFilters,
  videoFiltersToParams,
  type VideoFilters,
} from "@/components/videos/list-filters";
import {
  cn,
  formatCount,
  formatRelative,
  isTerminalStatus,
} from "@/lib/utils";
import type { AnalysisStatus } from "@/types";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 博主详情页主体:该博主采集到的所有视频(卡片网格 + 通用筛选)。
 *
 * 数据流:
 *   1. server 在 app/creators/[id]/page.tsx 已经拉过 stats / creator 元信息
 *   2. client 拉 /api/creators/[creatorId]/videos(支持 status / search / 播放 / 点赞 /
 *      发布时间 / 时长 / 排序 等全维度筛选)
 *   3. filters / page 变化 → refetch;含非终态视频时每 5s 静默 refetch
 *
 * 视觉:
 *   - Editorial 卡片网格:封面 + 标题 + 状态 badge + 数字 + 时间
 *   - 24h 内 created_at → 右上角 "NEW" 橙红 badge
 *   - completed 状态卡片可点击(整卡 + 封面都是 Link)
 *   - 非终态卡片也保留 Link(进详情看状态),但视觉上灰显(opacity)
 */

const POLL_INTERVAL_MS = 5_000;
const TITLE_MAX = 60;
const PAGE_SIZE = 20;
const NEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type ApiListResponse = {
  videos: VideoListItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

interface CreatorVideosProps {
  /** creator 行 id(主键,用于 API 路由) */
  creatorId: string;
  /** creator.creator_id(TikTok author_id,用于回退查询时的精确匹配) */
  authorId: string | null;
}

export function CreatorVideos({ creatorId, authorId }: CreatorVideosProps) {
  const [filters, setFilters] = React.useState<VideoFilters>(DEFAULT_VIDEO_FILTERS);
  const [videos, setVideos] = React.useState<VideoListItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 客户端 tick:每分钟刷新一次"24h 内 NEW"判定(不需要每帧重算)
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchPage = React.useCallback(
    async (targetPage: number, targetFilters: VideoFilters) => {
      setLoading(true);
      setError(null);
      try {
        const params = videoFiltersToParams(targetFilters);
        params.set("page", String(targetPage));
        params.set("pageSize", String(PAGE_SIZE));
        const res = await fetch(
          `/api/creators/${encodeURIComponent(creatorId)}/videos?${params.toString()}`,
          { cache: "no-store" }
        );
        const payload = (await res.json().catch(() => ({}))) as ApiListResponse;
        if (!res.ok) {
          setError(payload.error ?? "加载失败,请稍后再试");
          return;
        }
        setVideos(payload.videos);
        setTotal(payload.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "网络错误");
      } finally {
        setLoading(false);
      }
    },
    [creatorId]
  );

  // 筛选变化 → 回到第 1 页
  const handleFiltersChange = React.useCallback(
    (next: VideoFilters) => {
      setFilters(next);
      setPage(1);
      void fetchPage(1, next);
    },
    [fetchPage]
  );

  const handlePageChange = React.useCallback(
    (next: number) => {
      const safe = Math.max(1, Math.min(totalPages, next));
      setPage(safe);
      void fetchPage(safe, filters);
    },
    [fetchPage, filters, totalPages]
  );

  // 首次 + authorId 变化时拉一次首屏
  React.useEffect(() => {
    void fetchPage(1, DEFAULT_VIDEO_FILTERS);
  }, [fetchPage, authorId]);

  // 轮询:当前页含非终态视频时,每 5 秒静默 refetch
  React.useEffect(() => {
    const hasInFlight = videos.some((v) => !isTerminalStatus(v.analysis_status));
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      void fetchPage(page, filters);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPage, page, filters, videos]);

  const isNewlyFetched = React.useCallback(
    (createdAt: string): boolean => {
      const t = Date.parse(createdAt);
      return Number.isFinite(t) && now - t < NEW_THRESHOLD_MS;
    },
    [now]
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-2xl tracking-tight text-zinc-950 dark:text-zinc-50">
            采集的视频
          </h2>
          <Muted className="font-mono tabular-nums">
            {total.toLocaleString()} 条
          </Muted>
        </div>
        <ListFilters
          value={filters}
          onChange={handleFiltersChange}
          disabled={loading}
        />
      </div>

      {/* 错误条 */}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
        >
          {error}
        </div>
      ) : null}

      {/* 内容区 */}
      {videos.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<Film className="h-8 w-8" />}
            title={
              filters.search || filters.status !== "all"
                ? "没有匹配的视频"
                : "还没有采集到视频"
            }
            description={
              filters.search || filters.status !== "all"
                ? "试试清空筛选条件,或切换其他状态查看全部视频。"
                : "等待定时抓取触发后会出现在这里。也可以手动从博主列表触发立即抓取。"
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                isNew={isNewlyFetched(v.created_at)}
              />
            ))}
          </div>

          {/* 加载提示 */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载中
            </div>
          ) : null}
        </>
      )}

      {/* 分页 */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Muted className="text-xs">
            第 {page} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
          </Muted>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition-colors",
                "hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              )}
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition-colors",
                "hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              )}
              aria-label="下一页"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// VideoCard — 单个视频卡(Editorial 杂志风)
//   封面 16:9 → 标题(60 字截断) → 状态 + 数字 + 时间 → NEW badge
// ============================================================

function truncate(s: string | null, n: number): string {
  if (!s) return "未命名视频";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

interface VideoCardProps {
  video: VideoListItem;
  isNew: boolean;
}

function VideoCard({ video, isNew }: VideoCardProps) {
  const terminal = isTerminalStatus(video.analysis_status);
  return (
    <Link
      href={`/videos/${video.id}`}
      className={cn(
        "group block focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 dark:focus:ring-zinc-700",
        !terminal && "opacity-75"
      )}
      aria-label={`查看 ${video.title ?? "视频"} 详情`}
    >
      <Card className="flex h-full flex-col gap-3 overflow-hidden p-0 transition-colors group-hover:border-zinc-300 dark:group-hover:border-zinc-700">
        {/* 封面 */}
        <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {video.cover_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={video.cover_url}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              <Film className="h-8 w-8" />
            </div>
          )}
          {isNew ? (
            <div className="absolute right-2 top-2">
              <Badge
                variant="default"
                className="border-[#C04A1A]/30 bg-[#C04A1A] text-white shadow-sm hover:bg-[#C04A1A]/90"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                NEW
              </Badge>
            </div>
          ) : null}
        </div>

        {/* 文字区 */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3
            className="line-clamp-2 text-sm font-medium leading-snug text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-50 dark:group-hover:text-white"
            title={video.title ?? ""}
          >
            {truncate(video.title, TITLE_MAX)}
          </h3>

          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge
                status={video.analysis_status as AnalysisStatus}
                size="sm"
              />
              <Muted className="text-xs">
                {formatRelative(video.created_at)}
              </Muted>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <span>
                播放{" "}
                <Numeric className="text-xs">
                  {formatCount(video.play_count)}
                </Numeric>
              </span>
              <span>
                点赞{" "}
                <Numeric className="text-xs">
                  {formatCount(video.like_count)}
                </Numeric>
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
