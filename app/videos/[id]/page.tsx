import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Divider, H1, Muted } from "@/components/ui/typography";
import { AnalysisView } from "@/components/videos/analysis-view";
import { PendingAnalysisPanel } from "@/components/videos/pending-analysis-panel";
import { getVideoById, getLatestAnalysis } from "@/lib/supabase/queries";
import { TERMINAL_STATUSES } from "@/types";
import type { AnalysisResultRow, VideoDetail } from "@/lib/pipeline/types";

/**
 * 视频分析详情页 — Editorial / 杂志风格:
 *
 *   1. 顶部返回链接 + H1(视频标题)
 *   2. 状态分支:
 *      - 终态 completed + 有 analysis → 渲染 AnalysisView(8 区块)
 *      - 其他(非终态 / 失败 / 重复)→ 渲染 PendingAnalysisPanel(进度 + 轮询)
 *      - failed / duplicate → 渲染友好提示 + 重试/查看按钮
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  let video: VideoDetail | null;
  let analysis: AnalysisResultRow | null;
  try {
    video = await getVideoById(id);
    if (!video) notFound();
    analysis = await getLatestAnalysis(id);
  } catch (err) {
    console.error("[videos/[id]] 查询失败", err);
    throw err;
  }

  const status = video.analysis_status;
  const isTerminal = (TERMINAL_STATUSES as ReadonlyArray<string>).includes(status);
  const showAnalysis = status === "completed" && analysis !== null;

  return (
    <div className="min-h-full">
      {/* 顶部 Header(始终展示) */}
      <header className="mx-auto max-w-6xl px-6 pt-12 md:pt-16">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回视频库
        </Link>

        <div className="mt-8 space-y-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            Video Detail · 视频档案
          </Muted>
          <H1 size="lg" className="text-4xl tracking-tighter md:text-5xl">
            {video.title ?? "未命名视频"}
          </H1>
        </div>
      </header>

      <Divider className="mx-auto my-12 max-w-6xl md:my-16" />

      {/* 内容区 */}
      {showAnalysis ? (
        <AnalysisView video={video} analysis={analysis!} />
      ) : (
        <PendingAnalysisPanel
          video={video}
          initialAnalysis={analysis}
          isTerminal={isTerminal}
        />
      )}
    </div>
  );
}