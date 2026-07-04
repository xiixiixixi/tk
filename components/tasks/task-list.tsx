"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/tasks/status-badge";
import { truncate, formatDateTime } from "@/lib/utils";
import type { VideoListItem } from "@/lib/pipeline/types";

/**
 * 最近任务列表 — JOIN videos 显示真实进度
 *
 * 关键设计:
 * - 不显示 task.status(Pipeline 不更新这个字段)
 * - 而显示 videos.analysis_status(实际分析进度,通过 StatusBadge 样式)
 * - task.status 仅用作 grouping(后台逻辑),用户看不到
 *
 * 数据流:走 /api/tasks GET(service_role 查,绕过 RLS)。
 * RLS 安全加固后,前端 anon key 不能直查 tasks 表,必须走 API。
 *
 * 监听 window 'tasks:changed' 事件,提交新任务后自动 refetch。
 */

const RECENT_LIMIT = 10;

interface RecentTaskWithVideo {
  id: string;
  task_type: string;
  input_value: string;
  status: string;
  created_at: string;
  /**
   * Supabase 返回的 FK JOIN 是数组(因为 related_video_id 是 nullable FK)。
   * 实际 99% 是单个;这里只取 [0] 用。Phase 5 重构时改 JSON path。
   */
  videos: Array<Pick<VideoListItem, "id" | "analysis_status" | "title">> | null;
}

const TASK_TYPE_LABEL: Record<string, string> = {
  analyze_video: "视频分析",
  monitor_creator: "博主监控",
  search_keyword: "关键词搜索",
  refresh_metrics: "数据刷新",
  reanalyze_video: "重新分析",
};

const TASK_TYPE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  analyze_video: "default",
  monitor_creator: "secondary",
  search_keyword: "outline",
  refresh_metrics: "secondary",
  reanalyze_video: "outline",
};

export function TaskList() {
  const router = useRouter();
  const [tasks, setTasks] = useState<RecentTaskWithVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 走 API(service_role 查,JOIN videos 拿真实 analysis_status)
      const res = await fetch(`/api/tasks?limit=${RECENT_LIMIT}`, { cache: "no-store" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(err.error ?? `加载失败 (HTTP ${res.status})`);
        setTasks([]);
        return;
      }
      const payload = (await res.json()) as { tasks?: RecentTaskWithVideo[] };
      setTasks(payload.tasks ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载失败");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const onChanged = () => void load();
    window.addEventListener("tasks:changed", onChanged);
    return () => window.removeEventListener("tasks:changed", onChanged);
  }, [load]);

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-zinc-950 md:text-2xl dark:text-zinc-50">
          最近的任务
        </h2>
        <Link
          href="/videos"
          className="text-sm text-[#C04A1A] underline-offset-4 hover:underline"
        >
          查看全部 →
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <div className="flex items-center justify-center px-6 py-12 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : loadError ? (
          <div className="px-6 py-12 text-center text-sm text-red-600 dark:text-red-400">
            {loadError}
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            暂无任务,提交一个分析试试
          </div>
        ) : (
          <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tasks.map((task) => {
              // JOIN 拿第一个 video(99% 情况就一个;数组是 supabase-js FK JOIN 的返回格式)
              const video = task.videos?.[0];
              // 真实进度:video 存在 → 用 video.analysis_status;否则 fallback task.status
              const realStatus = video?.analysis_status ?? task.status;
              const detailHref = video?.id ? `/videos/${video.id}` : "/videos";
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => router.push(detailHref)}
                    className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:hover:bg-zinc-900/60 dark:focus-visible:bg-zinc-900/60"
                  >
                    <Badge
                      variant={TASK_TYPE_VARIANT[task.task_type] ?? "outline"}
                      className="shrink-0"
                    >
                      {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                      {truncate(video?.title ?? task.input_value)}
                    </span>
                    <StatusBadge status={realStatus} />
                    <span className="hidden shrink-0 font-mono text-xs tabular-nums text-zinc-500 sm:inline dark:text-zinc-400">
                      {formatDateTime(task.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
