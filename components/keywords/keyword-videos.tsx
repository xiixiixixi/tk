"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Numeric, Muted } from "@/components/ui/typography";
import { StatusBadge } from "@/components/tasks/status-badge";
import {
  ListFilters,
  DEFAULT_VIDEO_FILTERS,
  videoFiltersToParams,
  type VideoFilters,
} from "@/components/videos/list-filters";
import { cn, truncate, formatRelative, formatCount, isTerminalStatus } from "@/lib/utils";
import type { AnalysisStatus } from "@/types";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 关键词详情页 — 视频列表客户端组件。
 *
 * 数据流:
 *   1. 服务端 page.tsx 把 keyword.keyword 传进来(锁定 sourceType=keyword_search + sourceValue)
 *   2. 客户端 useState 持有 VideoFilters,换页 / 改筛 → fetch('/api/videos?...')
 *   3. 轮询:当前页含非终态视频时,每 5 秒静默 refetch
 *
 * 与 creator-videos 唯一区别:不再带 authorId,改用 sourceType + sourceValue。
 */

const POLL_INTERVAL_MS = 5_000;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h 内算 NEW

type ApiListResponse = {
  videos: VideoListItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

interface KeywordVideosProps {
  /** 关键词文本(对应 videos.source_value) */
  keyword: string;
  pageSize?: number;
}

/** 24h 内创建 → 加 NEW 橙章 */
function isNew(createdAt: string, now: number = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < NEW_WINDOW_MS;
}

export function KeywordVideos({ keyword, pageSize = 20 }: KeywordVideosProps) {
  const router = useRouter();

  const [videos, setVideos] = React.useState<VideoListItem[]>([]);
  const [total, setTotal] = React.useState<number>(0);
  const [page, setPage] = React.useState<number>(1);
  const [filters, setFilters] =
    React.useState<VideoFilters>(DEFAULT_VIDEO_FILTERS);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchPage = React.useCallback(
    async (targetPage: number, targetFilters: VideoFilters) => {
      setLoading(true);
      setError(null);
      try {
        const params = videoFiltersToParams(targetFilters);
        params.set("sourceType", "keyword_search");
        params.set("sourceValue", keyword);
        params.set("page", String(targetPage));
        params.set("pageSize", String(pageSize));
        const res = await fetch(`/api/videos?${params.toString()}`, {
          cache: "no-store",
        });
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
    [keyword, pageSize]
  );

  // 首次挂载拉首屏(无 SSR 数据,keyword 详情页不强制 SSR 视频列表)
  React.useEffect(() => {
    void fetchPage(1, DEFAULT_VIDEO_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

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

  // 轮询:仅在当前页含非终态视频时启动
  React.useEffect(() => {
    const hasInFlight = videos.some((v) => !isTerminalStatus(v.analysis_status));
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      void fetchPage(page, filters);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPage, page, filters, videos]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          关键词采集 ·{" "}
          <span className="font-mono tabular-nums text-neutral-900 dark:text-neutral-50">
            {total.toLocaleString()}
          </span>{" "}
          条
        </p>
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
          className=" border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
        >
          {error}
        </div>
      ) : null}

      {/* 表格 / 空态 */}
      {videos.length === 0 && !loading ? (
        <div className=" border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <EmptyState
            title="该关键词还没有采集到视频"
            description="系统会按监控频率定期搜索该关键词,新视频入库后会自动出现在这里。"
          />
        </div>
      ) : (
        <div className="relative overflow-hidden  border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {loading ? (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2  bg-white/80 px-2.5 py-1 text-xs text-neutral-500 backdrop-blur dark:bg-neutral-950/80 dark:text-neutral-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载中
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[64px]">封面</TableHead>
                <TableHead className="min-w-[260px]">标题</TableHead>
                <TableHead>作者</TableHead>
                <TableHead className="text-right">播放</TableHead>
                <TableHead className="text-right">点赞</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((v) => {
                const showNew = isNew(v.created_at);
                return (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                    onClick={(e) => {
                      // 避免点 Link 时重复触发
                      const target = e.target as HTMLElement;
                      if (target.closest("a")) return;
                      router.push(`/videos/${v.id}`);
                    }}
                  >
                    <TableCell className="py-3">
                      <Link
                        href={`/videos/${v.id}`}
                        className="block h-10 w-10 overflow-hidden  bg-neutral-100 dark:bg-neutral-900"
                        aria-label={v.title ?? "查看视频详情"}
                      >
                        {v.cover_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={v.cover_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                            暂无
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[360px] py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/videos/${v.id}`}
                          title={v.title ?? ""}
                          className={cn(
                            "block truncate text-sm font-medium text-neutral-900",
                            "hover:text-neutral-900 hover:underline underline-offset-2",
                            "dark:text-neutral-50 dark:hover:text-white"
                          )}
                        >
                          {truncate(v.title)}
                        </Link>
                        {showNew ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 gap-1 border-[hsl(var(--color-ikb))]/30 bg-[hsl(var(--color-ikb))]/10 px-1.5 py-0",
                              "text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--color-ikb))]",
                              "dark:border-[hsl(var(--color-ikb))]/40 dark:bg-[hsl(var(--color-ikb))]/20 dark:text-[#E8855A]"
                            )}
                            aria-label="24 小时内新采集"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            NEW
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {v.author_name ?? "—"}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Numeric className="text-sm">
                        {formatCount(v.play_count)}
                      </Numeric>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Numeric className="text-sm">
                        {formatCount(v.like_count)}
                      </Numeric>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge
                        status={v.analysis_status as AnalysisStatus}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Muted className="text-xs">
                        {formatRelative(v.created_at)}
                      </Muted>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Muted className="text-xs">
            第 {page} / {totalPages} 页 · 每页 {pageSize} 条
          </Muted>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className={cn(
                "inline-flex h-9 items-center gap-1  border border-neutral-200 bg-white px-3 text-sm text-neutral-700 transition-colors",
                "hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900"
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
                "inline-flex h-9 items-center gap-1  border border-neutral-200 bg-white px-3 text-sm text-neutral-700 transition-colors",
                "hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900"
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