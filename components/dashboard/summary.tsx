import Link from "next/link";
import { Hash, Sparkles, TrendingUp, User, Video } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Muted, Numeric } from "@/components/ui/typography";
import { formatCount, truncate } from "@/lib/utils";
import type { DashboardStats } from "@/lib/supabase/queries";
import type { VideoListItem } from "@/lib/pipeline/types";
import type { SourceType } from "@/types";

/**
 * 首页工作台汇总 — Editorial 杂志风。
 *
 * 服务端组件(server):只接收已查好的 stats + recentVideos,
 * 不在客户端发请求 / 不需要 hook。
 *
 * 两块布局:
 *   1. 5 个统计卡片 → 点击跳转到对应列表页
 *   2. 最近采集(8 条) → 缩略图 + 标题 + 状态 + 来源 + 24h 内 NEW 徽章
 */

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_TITLE_MAX = 48;

interface DashboardSummaryProps {
  stats: DashboardStats;
  recentVideos: VideoListItem[];
}

/** 统计卡片元数据 — 单一定义,避免散落硬编码 */
const STAT_CARDS: ReadonlyArray<{
  key: keyof DashboardStats;
  label: string;
  href: string;
  Icon: typeof User;
}> = [
  { key: "creator_count", label: "已订阅博主", href: "/creators", Icon: User },
  { key: "keyword_count", label: "已订阅关键词", href: "/keywords", Icon: Hash },
  { key: "video_total", label: "视频库总数", href: "/videos", Icon: Video },
  { key: "new_today", label: "今日新增", href: "/videos", Icon: TrendingUp },
  {
    key: "pending_analysis",
    label: "待解析",
    href: "/videos",
    Icon: Sparkles,
  },
];

/** source_type → 中文短标签(对齐 video-table 的 SOURCE_LABELS) */
const SOURCE_LABELS: Record<SourceType, string> = {
  manual_video: "手动",
  creator_monitor: "博主",
  keyword_search: "关键词",
  hashtag_search: "hashtag",
};

function isNew(createdAt: string, now: number = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < NEW_WINDOW_MS;
}

export function DashboardSummary({ stats, recentVideos }: DashboardSummaryProps) {
  return (
    <div className="space-y-12">
      {/* 统计卡片 — 5 列响应式 */}
      <section aria-label="工作台统计概览">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            工作台概览
          </h2>
          <Muted>实时 · 服务端聚合</Muted>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAT_CARDS.map(({ key, label, href, Icon }) => {
            const value = stats[key];
            return (
              <Link
                key={key}
                href={href}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-300"
              >
                <Card className="h-full transition-colors group-hover:border-zinc-300 group-hover:bg-zinc-50/50 dark:group-hover:border-zinc-700 dark:group-hover:bg-zinc-900/40">
                  <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Icon className="h-4 w-4" aria-hidden />
                      <Muted className="text-xs">{label}</Muted>
                    </div>
                    <Numeric className="text-3xl font-semibold tracking-tight">
                      {formatCount(value)}
                    </Numeric>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 最近采集 — 缩略图网格 */}
      <section aria-label="最近采集的视频">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            最近采集
          </h2>
          <Link
            href="/videos"
            className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-[#C04A1A] dark:text-zinc-400"
          >
            查看全部 →
          </Link>
        </div>

        {recentVideos.length === 0 ? (
          <Card>
            <EmptyState
              title="还没有任何视频"
              description="去订阅一位博主或一个关键词,系统会开始自动采集并在此展示最近入库的视频。"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {recentVideos.map((video) => {
              const isNewItem = isNew(video.created_at);
              return (
                <Link
                  key={video.id}
                  href={`/videos/${video.id}`}
                  className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-300"
                >
                  <Card className="h-full overflow-hidden transition-colors group-hover:border-zinc-300 dark:group-hover:border-zinc-700">
                    {/* 封面 — 16:9 比例,封面色块 fallback */}
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
                          暂无封面
                        </div>
                      )}
                      {isNewItem ? (
                        <span className="absolute left-2 top-2 rounded-md bg-[#C04A1A] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
                          New
                        </span>
                      ) : null}
                    </div>

                    <CardContent className="space-y-2 p-3">
                      <p
                        title={video.title ?? ""}
                        className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-50"
                      >
                        {truncate(video.title, RECENT_TITLE_MAX)}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <Muted className="truncate">
                          {video.source_type in SOURCE_LABELS
                            ? SOURCE_LABELS[video.source_type as SourceType]
                            : video.source_type || "—"}
                        </Muted>
                        <StatusBadge status={video.analysis_status} size="sm" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}