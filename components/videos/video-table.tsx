"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Link2,
  User,
  Hash,
  Sparkles,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Numeric, Muted } from "@/components/ui/typography";
import { StatusBadge } from "@/components/tasks/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ListFilters,
  DEFAULT_VIDEO_FILTERS,
  videoFiltersToParams,
  type VideoFilters,
} from "@/components/videos/list-filters";
import { cn, truncate, formatRelative, formatCount, isTerminalStatus } from "@/lib/utils";
import { SOURCE_TYPES, type AnalysisStatus, type SourceType } from "@/types";
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
 *   2. 标题(60 字截断 + hover 完整 + 24h 内 NEW 橙章)
 *   3. 来源(图标 + 手动/博主/关键词/hashtag)
 *   4. 作者
 *   5. 播放量(Numeric + 1.2万格式)
 *   6. 点赞(Numeric)
 *   7. 状态(StatusBadge)
 *   8. 创建时间(相对时间)
 *
 * 行交互:
 *   - 第一列(封面+标题)是 Link,可右键新标签页打开
 *   - 整行 onClick 触发 router.push(详情页),cursor-pointer
 */

const POLL_INTERVAL_MS = 5_000;
const TITLE_MAX = 60;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h 内算 NEW

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

/** source_type → (图标, 中文标签) */
const SOURCE_LABELS: Record<SourceType, { label: string; Icon: typeof Link2 }> = {
  manual_video: { label: "手动", Icon: Link2 },
  creator_monitor: { label: "博主", Icon: User },
  keyword_search: { label: "关键词", Icon: Hash },
  hashtag_search: { label: "hashtag", Icon: Hash },
};

/** 24h 内创建 → 加 NEW 橙章(走 rust 橙品牌色) */
function isNew(createdAt: string, now: number = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < NEW_WINDOW_MS;
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
  const urlSourceType = (searchParams.get("sourceType") as SourceType | null) ?? "";
  // 博主跳转:?author=用户名 → 填入搜索框(模糊匹配标题+作者)
  const urlAuthor = searchParams.get("author") ?? "";
  // 关键词跳转:?sourceValue=关键词 → 精确匹配 source_value
  const urlSourceValue = searchParams.get("sourceValue") ?? "";

  const [videos, setVideos] = React.useState<VideoListItem[]>(initialVideos);
  const [total, setTotal] = React.useState<number>(initialTotal);
  const [page, setPage] = React.useState<number>(urlPage);
  const [filters, setFilters] = React.useState<VideoFilters>({
    ...DEFAULT_VIDEO_FILTERS,
    status: urlStatus ?? DEFAULT_VIDEO_FILTERS.status,
    search: urlAuthor, // author 跳转 → 复用 search(模糊匹配)
  });
  const [sourceType, setSourceType] = React.useState<SourceType | "">(urlSourceType);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 同步 URL searchParams(可分享 / 浏览器后退可用)
  // 透传所有 VideoFilters 非空项 + page + sourceType
  const syncUrl = React.useCallback(
    (nextPage: number, nextFilters: VideoFilters, nextSource: SourceType | "") => {
      const params = videoFiltersToParams(nextFilters);
      if (nextPage > 1) params.set("page", String(nextPage));
      if (nextSource) params.set("sourceType", nextSource);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const fetchPage = React.useCallback(
    async (targetPage: number, targetFilters: VideoFilters, targetSource: SourceType | "") => {
      setLoading(true);
      setError(null);
      try {
        const params = videoFiltersToParams(targetFilters);
        params.set("page", String(targetPage));
        params.set("pageSize", String(pageSize));
        if (targetSource) params.set("sourceType", targetSource);
        if (urlSourceValue) params.set("sourceValue", urlSourceValue);
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
    [pageSize, urlSourceValue]
  );

  // 筛选变更 → 回到第 1 页
  const handleFiltersChange = React.useCallback(
    (next: VideoFilters) => {
      setFilters(next);
      setPage(1);
      syncUrl(1, next, sourceType);
      void fetchPage(1, next, sourceType);
    },
    [fetchPage, sourceType, syncUrl]
  );

  const handleSourceChange = React.useCallback(
    (next: SourceType | "") => {
      setSourceType(next);
      setPage(1);
      syncUrl(1, filters, next);
      void fetchPage(1, filters, next);
    },
    [fetchPage, filters, syncUrl]
  );

  const handlePageChange = React.useCallback(
    (next: number) => {
      const safe = Math.max(1, Math.min(totalPages, next));
      setPage(safe);
      syncUrl(safe, filters, sourceType);
      void fetchPage(safe, filters, sourceType);
    },
    [fetchPage, filters, sourceType, syncUrl, totalPages]
  );

  // 轮询:仅在当前页含非终态视频时启动,降低常态开销
  React.useEffect(() => {
    const hasInFlight = videos.some((v) => !isTerminalStatus(v.analysis_status));
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      void fetchPage(page, filters, sourceType);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPage, page, filters, sourceType, videos]);

  return (
    <div className="space-y-6">
      {/* Toolbar:左侧总数,右侧筛选栏(ListFilters + 来源 select) */}
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          视频库 ·{" "}
          <span className="font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
            {total.toLocaleString()}
          </span>{" "}
          条
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <ListFilters
            value={filters}
            onChange={handleFiltersChange}
            disabled={loading}
          />
          {/* 来源筛选:全部 + 4 种来源 */}
          <select
            value={sourceType}
            onChange={(e) => handleSourceChange(e.target.value as SourceType | "")}
            disabled={loading}
            aria-label="按来源筛选"
            className={cn(
              "h-9 rounded-md border border-zinc-200 bg-white px-3 pr-8 text-sm text-zinc-900 transition-colors",
              "focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
            )}
          >
            <option value="">全部来源</option>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s].label}
              </option>
            ))}
          </select>
        </div>
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
            title={filters.status === "all" && !sourceType ? "视频库还是空的" : "没有匹配的视频"}
            description={
              filters.status === "all" && !sourceType
                ? "提交一条 TikTok 视频链接开始分析,完成后会出现在这里。"
                : "试试切换其他筛选条件,或清空筛选查看全部视频。"
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
                <TableHead>来源</TableHead>
                <TableHead>作者</TableHead>
                <TableHead className="text-right">播放</TableHead>
                <TableHead className="text-right">点赞</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((v) => {
                const sourceMeta = SOURCE_LABELS[v.source_type as SourceType];
                const showNew = isNew(v.created_at);
                return (
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
                      <div className="flex items-center gap-2">
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
                        {showNew ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 gap-1 border-[#C04A1A]/30 bg-[#C04A1A]/10 px-1.5 py-0",
                              "text-[10px] font-semibold uppercase tracking-wide text-[#C04A1A]",
                              "dark:border-[#C04A1A]/40 dark:bg-[#C04A1A]/20 dark:text-[#E8855A]"
                            )}
                            aria-label="24 小时内新采集"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            NEW
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {sourceMeta ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                          <sourceMeta.Icon className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-500" />
                          {sourceMeta.label}
                        </span>
                      ) : (
                        <Muted className="text-xs">—</Muted>
                      )}
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