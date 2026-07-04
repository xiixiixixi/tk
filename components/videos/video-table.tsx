"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Link2, User, Hash, Sparkles } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Numeric, Muted } from "@/components/ui/typography";
import { StatusBadge } from "@/components/tasks/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters, DEFAULT_VIDEO_FILTERS, videoFiltersToParams, type VideoFilters } from "@/components/videos/list-filters";
import { cn, truncate, formatRelative, formatCount, isTerminalStatus } from "@/lib/utils";
import { SOURCE_TYPES, type AnalysisStatus, type SourceType } from "@/types";
import type { VideoListItem } from "@/lib/pipeline/types";

const POLL_INTERVAL_MS = 5_000;
const TITLE_MAX = 60;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type ApiListResponse = { videos: VideoListItem[]; total: number; page: number; pageSize: number; error?: string };

interface VideoTableProps { initialVideos: VideoListItem[]; initialTotal: number; pageSize?: number }

const SOURCE_LABELS: Record<SourceType, { label: string; Icon: typeof Link2 }> = {
  manual_video: { label: "手动", Icon: Link2 },
  creator_monitor: { label: "博主", Icon: User },
  keyword_search: { label: "关键词", Icon: Hash },
  hashtag_search: { label: "hashtag", Icon: Hash },
};

function isNew(createdAt: string, now: number = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  return Number.isNaN(t) ? false : now - t < NEW_WINDOW_MS;
}

export function VideoTable({ initialVideos, initialTotal, pageSize = 20 }: VideoTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const urlStatus = (searchParams.get("status") as AnalysisStatus | null) ?? null;
  const urlSourceType = (searchParams.get("sourceType") as SourceType | null) ?? "";
  const urlAuthor = searchParams.get("author") ?? "";
  const urlSourceValue = searchParams.get("sourceValue") ?? "";

  const [videos, setVideos] = React.useState<VideoListItem[]>(initialVideos);
  const [total, setTotal] = React.useState<number>(initialTotal);
  const [page, setPage] = React.useState<number>(urlPage);
  const [filters, setFilters] = React.useState<VideoFilters>({ ...DEFAULT_VIDEO_FILTERS, status: urlStatus ?? DEFAULT_VIDEO_FILTERS.status, search: urlAuthor });
  const [sourceType, setSourceType] = React.useState<SourceType | "">(urlSourceType);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const syncUrl = React.useCallback((nextPage: number, nextFilters: VideoFilters, nextSource: SourceType | "") => {
    const params = videoFiltersToParams(nextFilters);
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextSource) params.set("sourceType", nextSource);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  const fetchPage = React.useCallback(async (targetPage: number, targetFilters: VideoFilters, targetSource: SourceType | "") => {
    setLoading(true); setError(null);
    try {
      const params = videoFiltersToParams(targetFilters);
      params.set("page", String(targetPage));
      params.set("pageSize", String(pageSize));
      if (targetSource) params.set("sourceType", targetSource);
      if (urlSourceValue) params.set("sourceValue", urlSourceValue);
      const res = await fetch(`/api/videos?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as ApiListResponse;
      if (!res.ok) { setError(payload.error ?? "加载失败"); return; }
      setVideos(payload.videos); setTotal(payload.total);
    } catch (err) { setError(err instanceof Error ? err.message : "网络错误"); }
    finally { setLoading(false); }
  }, [pageSize, urlSourceValue]);

  const handleFiltersChange = React.useCallback((next: VideoFilters) => {
    setFilters(next); setPage(1); syncUrl(1, next, sourceType); void fetchPage(1, next, sourceType);
  }, [fetchPage, sourceType, syncUrl]);

  const handleSourceChange = React.useCallback((next: SourceType | "") => {
    setSourceType(next); setPage(1); syncUrl(1, filters, next); void fetchPage(1, filters, next);
  }, [fetchPage, filters, syncUrl]);

  const handlePageChange = React.useCallback((next: number) => {
    const safe = Math.max(1, Math.min(totalPages, next));
    setPage(safe); syncUrl(safe, filters, sourceType); void fetchPage(safe, filters, sourceType);
  }, [fetchPage, filters, sourceType, syncUrl, totalPages]);

  React.useEffect(() => {
    const hasInFlight = videos.some(v => !isTerminalStatus(v.analysis_status));
    if (!hasInFlight) return;
    const timer = setInterval(() => { void fetchPage(page, filters, sourceType); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPage, page, filters, sourceType, videos]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          视频库 <span className="font-mono tabular-nums text-neutral-900 dark:text-neutral-100">{total.toLocaleString()}</span> 条
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ListFilters value={filters} onChange={handleFiltersChange} disabled={loading} />
          <select
            value={sourceType} onChange={e => handleSourceChange(e.target.value as SourceType | "")}
            disabled={loading}
            className="h-9 border-b-2 border-neutral-300 bg-transparent px-0 text-xs font-bold uppercase tracking-wider text-neutral-900 transition-colors focus:border-neutral-900 focus:outline-none disabled:opacity-30 dark:border-neutral-700 dark:text-neutral-100 dark:focus:border-neutral-100"
          >
            <option value="">全部来源</option>
            {SOURCE_TYPES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s].label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="border-2 border-neutral-900 px-4 py-3 text-xs font-bold text-neutral-900 dark:border-neutral-100 dark:text-neutral-100">{error}</div>
      )}

      {videos.length === 0 && !loading ? (
        <div className="border-2 border-neutral-200 dark:border-neutral-800">
          <EmptyState title={filters.status === "all" && !sourceType ? "视频库还是空的" : "没有匹配的视频"} description={filters.status === "all" && !sourceType ? "提交一条 TikTok 视频链接开始分析" : "试试切换其他筛选条件"} />
        </div>
      ) : (
        <div className="relative overflow-hidden border-2 border-neutral-200 dark:border-neutral-800">
          {loading && (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 bg-white/90 px-2.5 py-1 text-xs font-bold text-neutral-500 backdrop-blur dark:bg-neutral-950/90 dark:text-neutral-400">
              <Loader2 className="h-3 w-3 animate-spin" /> 加载中
            </div>
          )}
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
                <TableHead className="text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map(v => {
                const sourceMeta = SOURCE_LABELS[v.source_type as SourceType];
                const showNew = isNew(v.created_at);
                return (
                  <TableRow key={v.id} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50" onClick={e => { if ((e.target as HTMLElement).closest("a")) return; router.push(`/videos/${v.id}`); }}>
                    <TableCell className="py-3">
                      <Link href={`/videos/${v.id}`} className="block h-10 w-10 overflow-hidden bg-neutral-100 dark:bg-neutral-900" aria-label={v.title ?? "查看详情"}>
                        {v.cover_url ? <img src={v.cover_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">暂无</span>}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[360px] py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/videos/${v.id}`} title={v.title ?? ""} className="block truncate text-sm font-bold text-neutral-900 hover:underline underline-offset-2 dark:text-neutral-100">
                          {truncate(v.title)}
                        </Link>
                        {showNew && <Badge variant="ikb" className="gap-1 px-1.5 py-0 text-[10px]"><Sparkles className="h-2.5 w-2.5" />NEW</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {sourceMeta ? <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500"><sourceMeta.Icon className="h-3.5 w-3.5" />{sourceMeta.label}</span> : <Muted>—</Muted>}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-neutral-600 dark:text-neutral-400">{v.author_name ?? "—"}</TableCell>
                    <TableCell className="py-3 text-right"><Numeric>{formatCount(v.play_count)}</Numeric></TableCell>
                    <TableCell className="py-3 text-right"><Numeric>{formatCount(v.like_count)}</Numeric></TableCell>
                    <TableCell className="py-3"><StatusBadge status={v.analysis_status as AnalysisStatus} size="sm" /></TableCell>
                    <TableCell className="py-3 text-right"><Muted>{formatRelative(v.created_at)}</Muted></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Muted>第 {page} / {totalPages} 页 · 每页 {pageSize} 条</Muted>
          <div className="flex items-center gap-2">
            <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading}
              className="inline-flex h-9 items-center gap-1 border-2 border-neutral-300 bg-transparent px-3 text-xs font-bold uppercase tracking-wider transition-colors hover:border-neutral-900 disabled:opacity-30 dark:border-neutral-700 dark:hover:border-neutral-100">
              <ChevronLeft className="h-4 w-4" /> 上一页
            </button>
            <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages || loading}
              className="inline-flex h-9 items-center gap-1 border-2 border-neutral-300 bg-transparent px-3 text-xs font-bold uppercase tracking-wider transition-colors hover:border-neutral-900 disabled:opacity-30 dark:border-neutral-700 dark:hover:border-neutral-100">
              下一页 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
