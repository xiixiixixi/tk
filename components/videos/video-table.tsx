"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Numeric, Muted } from "@/components/ui/typography";
import { StatusBadge } from "@/components/tasks/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusFilter, type StatusFilterValue } from "./status-filter";
import { cn, truncate, formatRelative, formatCount, isTerminalStatus } from "@/lib/utils";
import type { AnalysisStatus } from "@/types";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 视频库主表 — Editorial 杂志风格。
 *
 * 数据流:
 *   1. 服务端在 app/videos/page.tsx 调用 listVideos({ page: 1, pageSize })
 *      把 initialVideos / initialTotal 传进来(避免首屏空白)
 *   2. 客户端 useState 接管:换页 / 切筛选 → fetch('/api/videos?...')
 *   3. 副作用:router.replace 同步 URL searchParams(可分享 / 可后退)
 *   4. 轮询:当前页含非终态视频时,每 5 秒静默 refetch(不闪烁)
 *
 * 列:
 *   1. 封面 40×40 rounded
 *   2. 标题(60 字截断 + hover 完整)
 *   3. 作者
 *   4. 播放量(Numeric + 1.2万格式)
 *   5. 点赞(Numeric)
 *   6. 状态(StatusBadge)
 *   7. 创建时间(相对时间,fallback 完整日期)
 *
 * 行交互:
 *   - 第一列(封面+标题)是 Link,可右键新标签页打开
 *   - 整行 onClick 触发 router.push(详情页),cursor-pointer
 */

const POLL_INTERVAL_MS = 5_000;
const TITLE_MAX = 60;

type ApiListResponse = {
  videos: VideoListItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

interface VideoTableProps {
  initialVideos: VideoListItem[];
  initialTotal: number;
  pageSize?: number;
}

export function VideoTable({
  initialVideos,
  initialTotal,
  pageSize = 20,
}: VideoTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL → 初始状态(useSearchParams 在 client mount 后才稳定)
  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const urlStatus = (searchParams.get("status") as AnalysisStatus | null) ?? null;

  const [videos, setVideos] = React.useState<VideoListItem[]>(initialVideos);
  const [total, setTotal] = React.useState<number>(initialTotal);
  const [page, setPage] = React.useState<number>(urlPage);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterValue>(
    urlStatus ?? "all"
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 同步 URL searchParams(可分享 / 浏览器后退可用)
  const syncUrl = React.useCallback(
    (nextPage: number, nextStatus: StatusFilterValue) => {
      const params = new URLSearchParams();
      if (nextPage > 1) params.set("page", String(nextPage));
      if (nextStatus !== "all") params.set("status", nextStatus);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const fetchPage = React.useCallback(
    async (targetPage: number, targetStatus: StatusFilterValue) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(pageSize));
        if (targetStatus !== "all") params.set("status", targetStatus);
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
    [pageSize]
  );

  // 切换页 / 筛选
  const handleFilterChange = React.useCallback(
    (next: StatusFilterValue) => {
      setStatusFilter(next);
      setPage(1);
      syncUrl(1, next);
      void fetchPage(1, next);
    },
    [fetchPage, syncUrl]
  );

  const handlePageChange = React.useCallback(
    (next: number) => {
      const safe = Math.max(1, Math.min(totalPages, next));
      setPage(safe);
      syncUrl(safe, statusFilter);
      void fetchPage(safe, statusFilter);
    },
    [fetchPage, statusFilter, syncUrl, totalPages]
  );

  // 轮询:仅在当前页含非终态视频时启动,降低常态开销
  React.useEffect(() => {
    const hasInFlight = videos.some((v) => !isTerminalStatus(v.analysis_status));
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      void fetchPage(page, statusFilter);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPage, page, statusFilter, videos]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          视频库 ·{" "}
          <span className="font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
            {total.toLocaleString()}
          </span>{" "}
          条
        </p>
        <StatusFilter
          value={statusFilter}
          onChange={handleFilterChange}
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

      {/* 表格 / 空态 */}
      {videos.length === 0 && !loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <EmptyState
            title={statusFilter === "all" ? "视频库还是空的" : "没有匹配的视频"}
            description={
              statusFilter === "all"
                ? "提交一条 TikTok 视频链接开始分析,完成后会出现在这里。"
                : "试试切换其他状态筛选,或清空筛选查看全部视频。"
            }
          />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {loading ? (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md bg-white/80 px-2.5 py-1 text-xs text-zinc-500 backdrop-blur dark:bg-zinc-950/80 dark:text-zinc-400">
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
              {videos.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
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
                      className="block h-10 w-10 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900"
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
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                          暂无
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[360px] py-3">
                    <Link
                      href={`/videos/${v.id}`}
                      title={v.title ?? ""}
                      className={cn(
                        "block truncate text-sm font-medium text-zinc-900",
                        "hover:text-zinc-950 hover:underline underline-offset-2",
                        "dark:text-zinc-50 dark:hover:text-white"
                      )}
                    >
                      {truncate(v.title)}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-zinc-600 dark:text-zinc-400">
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
              ))}
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
