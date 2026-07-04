import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Divider, H1, Lead, Muted } from "@/components/ui/typography";
import { KeywordVideos } from "@/components/keywords/keyword-videos";
import {
  formatCronStatus,
  formatMonitorFrequency,
} from "@/components/monitor/utils";
import { getKeywordById, getKeywordVideoStats } from "@/lib/supabase/queries";
import type { KeywordRow } from "@/lib/pipeline/types";

/**
 * 关键词详情页 — Editorial / 杂志风格
 *
 *   1. 顶部返回「关键词监控」+ H1(keyword 文本)
 *   2. 筛选条件摘要(region / language / fetch_limit + 采集筛选)+ 统计 + 状态 badge
 *   3. 主体 KeywordVideos(客户端,自带筛选/分页/轮询/NEW badge)
 *
 * 数据流:
 *   server getKeywordById(id) + getKeywordVideoStats(keyword.keyword)
 *   → 传给 <KeywordVideos keyword={...} />
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KeywordDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  let keyword: KeywordRow | null;
  let stats: { video_count: number; analyzed_count: number };
  try {
    keyword = await getKeywordById(id);
    if (!keyword) notFound();
    stats = await getKeywordVideoStats(keyword.keyword);
  } catch (err) {
    console.error("[keywords/[id]] 查询失败", err);
    throw err;
  }

  return (
    <div className="min-h-full">
      {/* 顶部 Header */}
      <header className="mx-auto max-w-6xl px-6 pt-12 md:pt-16">
        <Link
          href="/keywords"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回关键词监控
        </Link>

        <div className="mt-8 space-y-5">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            Keyword · 关键词档案
          </Muted>
          <H1 className="text-xl font-medium tracking-tight">
            {keyword.keyword}
          </H1>

          {/* region / language / fetch_limit / 频率 / 状态 */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {keyword.region}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {keyword.language}
            </Badge>
            <Badge variant="default" className="font-mono">
              top {keyword.fetch_limit}
            </Badge>
            <Badge variant="secondary">
              {formatMonitorFrequency(keyword.monitor_frequency)}
            </Badge>
            <Badge
              variant={
                keyword.status === "active"
                  ? "default"
                  : keyword.status === "paused"
                    ? "outline"
                    : "secondary"
              }
            >
              {formatCronStatus(keyword.status)}
            </Badge>
          </div>

          {/* 统计 */}
          <Lead className="max-w-3xl text-base leading-relaxed md:text-lg">
            已采集{" "}
            <span className="font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
              {stats.video_count.toLocaleString()}
            </span>{" "}
            条 · 已解析{" "}
            <span className="font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
              {stats.analyzed_count.toLocaleString()}
            </span>{" "}
            条
          </Lead>
        </div>
      </header>

      <Divider className="mx-auto my-12 max-w-6xl md:my-16" />

      {/* 采集筛选条件摘要(任一非空才渲染) */}
      <section className="mx-auto max-w-6xl px-6">
        <KeywordFilterSummary keyword={keyword} />
      </section>

      {/* 视频列表 */}
      <section className="mx-auto mt-10 max-w-7xl px-6 md:mt-12">
        <KeywordVideos keyword={keyword.keyword} />
      </section>
    </div>
  );
}

/**
 * 采集筛选条件摘要 — 把 KeywordRow 上的可选筛选条目转成一行 chip,
 * 全部为空(null / false)时整段不渲染。
 */
function KeywordFilterSummary({ keyword }: { keyword: KeywordRow }) {
  const items: Array<{ label: string; value: string }> = [];

  if (keyword.min_play_count != null) {
    items.push({ label: "最低播放", value: formatNum(keyword.min_play_count) });
  }
  if (keyword.min_like_count != null) {
    items.push({ label: "最低点赞", value: formatNum(keyword.min_like_count) });
  }
  if (keyword.min_engagement_rate != null) {
    items.push({
      label: "最低互动率",
      value: `${(keyword.min_engagement_rate * 100).toFixed(1)}%`,
    });
  }
  if (keyword.published_after) {
    items.push({
      label: "发布不早于",
      value: keyword.published_after.slice(0, 10),
    });
  }
  if (keyword.min_duration_sec != null || keyword.max_duration_sec != null) {
    const min = keyword.min_duration_sec != null ? `${keyword.min_duration_sec}s` : "0s";
    const max =
      keyword.max_duration_sec != null ? `${keyword.max_duration_sec}s` : "∞";
    items.push({ label: "时长", value: `${min} – ${max}` });
  }
  if (keyword.unwanted_hashtags && keyword.unwanted_hashtags.length > 0) {
    items.push({
      label: "排除标签",
      value: keyword.unwanted_hashtags.map((t) => `#${t}`).join(" "),
    });
  }
  if (keyword.exclude_slideshow) {
    items.push({ label: "排除类型", value: "幻灯片" });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Muted className="font-mono uppercase tracking-[0.18em]">
        采集筛选
      </Muted>
      {items.map((it, i) => (
        <span
          key={`${it.label}-${i}`}
          className="text-sm text-zinc-700 dark:text-zinc-300"
        >
          <span className="text-zinc-500 dark:text-zinc-400">{it.label}:</span>{" "}
          <span className="font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function formatNum(n: number): string {
  return n.toLocaleString("zh-CN");
}