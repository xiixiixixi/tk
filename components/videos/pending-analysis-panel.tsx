"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Divider, Lead, Muted, P } from "@/components/ui/typography";
import { AnalysisView } from "@/components/videos/analysis-view";
import { STATUS_LABELS, type AnalysisStatus } from "@/types";
import type { AnalysisResultRow, VideoDetail } from "@/lib/pipeline/types";

/**
 * 视频分析未完成时的等待面板:
 *
 *   1. 非终态(queued / processing):显示进度文案 + 自动每 3 秒轮询 GET /api/videos/:id
 *      - 拉到 analysis_result 后直接切到 <AnalysisView />
 *      - 后台由 Railway 常驻 cron 推进管线,前端只负责轮询
 *   2. 终态 failed:显示错误文案 + 重试链接
 *   3. 终态 duplicate:显示"该视频已被分析过"+ 跳到原视频
 *
 * Server → Client 边界:
 *   父 page 已是 server,这里 "use client" 把轮询/状态交互放到客户端
 */

const POLL_INTERVAL_MS = 3_000;

interface PendingAnalysisPanelProps {
  video: VideoDetail;
  initialAnalysis: AnalysisResultRow | null;
  isTerminal: boolean;
}

export function PendingAnalysisPanel({
  video,
  initialAnalysis,
  isTerminal,
}: PendingAnalysisPanelProps) {
  const router = useRouter();

  // 初始如果 server 拉到 analysis,直接进入就绪态
  const [analysis, setAnalysis] = React.useState<AnalysisResultRow | null>(
    initialAnalysis
  );
  const [status, setStatus] = React.useState<AnalysisStatus>(
    video.analysis_status as AnalysisStatus
  );
  const [pollError, setPollError] = React.useState<string | null>(null);

  const isCompleted = status === "completed" && analysis !== null;

  // 轮询副作用
  React.useEffect(() => {
    if (isCompleted) return;
    if (isTerminal) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/videos/${video.id}`, { cache: "no-store" });
        if (!res.ok) {
          setPollError(`轮询失败 (HTTP ${res.status})`);
          return;
        }
        const payload = (await res.json()) as {
          video: VideoDetail;
          latest_analysis: AnalysisResultRow | null;
        };
        if (cancelled) return;
        setPollError(null);
        setStatus(payload.video.analysis_status as AnalysisStatus);
        setAnalysis(payload.latest_analysis);

        // 状态变终态 → 停止轮询
        const newTerminal = (
          ["completed", "failed", "duplicate"] as ReadonlyArray<string>
        ).includes(payload.video.analysis_status);
        if (newTerminal) {
          // completed → router.refresh 让 server 重新决定要不要切到 AnalysisView
          if (payload.video.analysis_status === "completed") {
            router.refresh();
          }
        }
      } catch (err) {
        setPollError(err instanceof Error ? err.message : "网络错误");
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isCompleted, isTerminal, router, video.id]);

  // 终态失败
  if (status === "failed") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Failed · 分析失败
        </Muted>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          这条视频没能完成分析
        </h2>
        <P className="mx-auto mt-3 max-w-md text-sm leading-relaxed">
          可能是抓取超时、网络问题或模型拒绝。
          你可以重新提交一次,或换一个视频链接试试。
        </P>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild variant="default">
            <Link href="/videos">重新提交</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/videos">返回视频库</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 终态重复
  if (status === "duplicate") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <Copy className="h-6 w-6" />
        </div>
        <Muted className="font-mono uppercase tracking-[0.18em]">
          Duplicate · 重复视频
        </Muted>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          这条视频之前已经分析过了
        </h2>
        <P className="mx-auto mt-3 max-w-md text-sm leading-relaxed">
          分析结果已关联到第一次入库的视频记录,不会重复跑管线。
        </P>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/videos">返回视频库</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 刚好在轮询中拿到了 analysis → 直接渲染分析视图
  if (analysis && status === "completed") {
    return <AnalysisView video={video} analysis={analysis} />;
  }

  // 排队 / 处理中
  return (
    <>
      {/* 头部:大封面 + 当前状态 */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 md:grid-cols-[160px_1fr]">
        <div className="relative aspect-[160/284] w-[160px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
          {video.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.cover_url}
              alt={video.title ?? "视频封面"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              <Play className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Muted className="font-mono uppercase tracking-[0.18em]">
              In Progress
            </Muted>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl dark:text-zinc-50">
            {video.title ?? "未命名视频"}
          </h2>

          <Lead className="max-w-2xl">
            {STATUS_LABELS[status] || "正在准备…"}
            <span className="ml-2 inline-block animate-pulse text-zinc-400">●</span>
          </Lead>

          {pollError ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400"
            >
              {pollError} · 自动重试中
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            每 3 秒自动刷新 · 后台自动处理中
          </div>

          {video.original_url ? (
            <div className="pt-1">
              <Link
                href={video.original_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                查看 TikTok 原文
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <Divider className="mx-auto my-12 max-w-6xl md:my-16" />

      {/* LoadingState 提示完整页面正在准备 */}
      <LoadingState variant="spinner" className="py-16" />
    </>
  );
}