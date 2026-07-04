import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Divider, H1, Muted } from "@/components/ui/typography";
import { CreatorVideos } from "@/components/creators/creator-videos";
import { getCreatorById, getCreatorVideoStats } from "@/lib/supabase/queries";
import { formatRelative } from "@/lib/utils";
import { formatCronStatus } from "@/components/monitor/utils";
import type { CreatorRow } from "@/lib/pipeline/types";

/**
 * 博主详情页 — Editorial / 杂志风格:
 *
 *   1. 顶部返回链接 + H1(@creator_name) + Muted(category) + 统计概览
 *   2. 主体:CreatorVideos(客户端组件,带筛选 + 轮询)
 *
 * 数据流:
 *   - server: getCreatorById(id) → 不存在 notFound()
 *   - server: getCreatorVideoStats(creator.creator_id) → 已采集 / 已解析
 *   - client: <CreatorVideos creatorId authorId /> 拉 /api/creators/[creatorId]/videos
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CreatorDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  let creator: CreatorRow | null;
  let stats: { video_count: number; analyzed_count: number };
  try {
    creator = await getCreatorById(id);
    if (!creator) notFound();
    stats = await getCreatorVideoStats(creator.creator_id);
  } catch (err) {
    console.error("[creators/[id]] 查询失败", err);
    throw err;
  }

  const displayName = creator.creator_name ?? creator.creator_url;
  const monitorStatus = creator.status; // active / paused / pending

  return (
    <div className="min-h-full">
      {/* 顶部 Header */}
      <header className="mx-auto max-w-6xl px-6 pt-12 md:pt-16">
        <Link
          href="/creators"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回博主
        </Link>

        <div className="mt-8 space-y-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            Creator Profile · 博主档案
          </Muted>
          <H1 className="text-xl font-medium tracking-tight">
            @{displayName}
          </H1>
          {creator.category ? (
            <Muted className="text-sm">{creator.category}</Muted>
          ) : null}
        </div>

        {/* 统计概览 — 4 列 Editorial 卡片排版 */}
        <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-zinc-200 py-6 md:grid-cols-4 dark:border-zinc-800">
          <Stat label="已采集" value={stats.video_count.toLocaleString()} />
          <Stat label="已解析" value={stats.analyzed_count.toLocaleString()} />
          <Stat label="最近抓取" value={formatRelative(creator.last_fetch_time)} />
          <div className="space-y-2">
            <dt className="text-xs uppercase tracking-wider text-zinc-500">订阅状态</dt>
            <dd>
              <span
                className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                title={`status: ${monitorStatus}`}
              >
                {formatCronStatus(monitorStatus)}
              </span>
            </dd>
          </div>
        </dl>
      </header>

      <Divider className="mx-auto my-12 max-w-6xl md:my-16" />

      {/* 主体:该博主采集的视频列表 */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <CreatorVideos creatorId={id} authorId={creator.creator_id} />
      </section>
    </div>
  );
}

// ============================================================
// Stat — 单个统计项(Editorial 风格:小标签 + 大数字 / 文案)
// ============================================================
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="font-mono text-2xl tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </dd>
    </div>
  );
}
