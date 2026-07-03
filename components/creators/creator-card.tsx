"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, User, Users2, Zap } from "lucide-react";
import { z } from "zod";

import type { CreatorRow } from "@/lib/pipeline/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { H3, Muted } from "@/components/ui/typography";
import { MonitorFormDialog } from "@/components/monitor/form-dialog";
import {
  CRON_STATUS_LABELS,
  emitMonitorsChanged,
  formatMonitorFrequency,
  useMonitorEvents,
} from "@/components/monitor/utils";
import { formatRelative, truncate } from "@/lib/utils";
import type { FieldValues } from "react-hook-form";

/**
 * 博主 UI 模块(2 个导出)
 *
 *   CreatorCard  — 单卡片(props:{ creator, onDelete, onFetch?, deleting?, fetching? })
 *   CreatorsList — 列表管理器(toolbar + 响应式 grid + EmptyState + 添加 dialog)
 *
 * 设计原则:
 * - CreatorCard 是纯展示卡,父组件(CreatorsList)拥有全部交互状态
 * - CreatorsList 监听 monitors:changed 事件,自动 refetch
 * - 删除 / 抓取用 DELETE /api/creators/[id] 和 POST /api/tasks(monitor_creator)
 * - 添加成功后由 MonitorFormDialog 内部 emit 'monitors:changed',CreatorsList 收到后 refetch
 */

// ============================================================
// CreatorCard — 单卡片
//   左:Avatar 占位(zinc-200 圆 + User icon)
//   中:H3 creator_url 截断 + @creator_name muted
//   右:monitor_frequency badge + last_fetch_time + 立即抓取 + 删除
// ============================================================

export interface CreatorCardProps {
  creator: CreatorRow;
  onDelete: (id: string) => void;
  /** 可选 — 立即抓取回调;不传则按钮 disabled(Phase 3 stub) */
  onFetch?: (id: string) => void;
  /** 当前卡片是否处于删除中(显示 spinner) */
  deleting?: boolean;
  /** 当前卡片是否处于抓取中(显示 spinner) */
  fetching?: boolean;
}

export function CreatorCard({
  creator,
  onDelete,
  onFetch,
  deleting,
  fetching,
}: CreatorCardProps) {
  const handleDelete = React.useCallback(() => {
    if (deleting) return;
    onDelete(creator.id);
  }, [creator.id, onDelete, deleting]);

  const handleFetch = React.useCallback(() => {
    if (fetching || !onFetch) return;
    onFetch(creator.id);
  }, [creator.id, onFetch, fetching]);

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-4">
        {/* 左:Avatar 占位 */}
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          <User className="h-6 w-6" />
        </div>

        {/* 中:URL + @handle */}
        <div className="min-w-0 flex-1 space-y-1">
          <H3 className="truncate text-base" title={creator.creator_url}>
            {truncate(creator.creator_url, 40)}
          </H3>
          <Muted className="truncate">@{creator.creator_name ?? "unknown"}</Muted>
        </div>

        {/* 右:badge + meta + 按钮 */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="secondary">
            {formatMonitorFrequency(creator.monitor_frequency)}
          </Badge>
          <Muted className="whitespace-nowrap">
            最近抓取:{formatRelative(creator.last_fetch_time)}
          </Muted>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetch}
              disabled={!onFetch || fetching}
              aria-label={`立即抓取 ${creator.creator_name ?? creator.creator_url}`}
            >
              {fetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              立即抓取
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label={`删除 ${creator.creator_name ?? creator.creator_url}`}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              删除
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// CreatorsList — 列表管理器
//   toolbar:N 个博主 + status filter + 添加博主按钮
//   3 列响应式 grid(grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
//   EmptyState
//   添加 dialog(复用 MonitorFormDialog,只有 creator_url 一项)
// ============================================================

type StatusFilter = "all" | "active" | "paused" | "pending";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: CRON_STATUS_LABELS.active ?? "运行中" },
  { value: "paused", label: CRON_STATUS_LABELS.paused ?? "已暂停" },
  { value: "pending", label: CRON_STATUS_LABELS.pending ?? "等待中" },
];

export interface CreatorsListProps {
  initialCreators: CreatorRow[];
}

export function CreatorsList({ initialCreators }: CreatorsListProps) {
  const [creators, setCreators] = React.useState<CreatorRow[]>(initialCreators);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [pendingFetchId, setPendingFetchId] = React.useState<string | null>(null);

  // 监听 monitors:changed → 重新拉列表
  // (添加成功由 MonitorFormDialog 内部 emit,删除成功由 handleDelete 显式 emit)
  useMonitorEvents(() => {
    void refetch();
  });

  async function refetch() {
    try {
      const res = await fetch("/api/creators", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { creators?: CreatorRow[] };
      setCreators(data.creators ?? []);
    } catch {
      // 网络错误静默 — 旧数据继续展示
    }
  }

  async function handleAdd(values: FieldValues) {
    const creatorUrl =
      typeof values.creator_url === "string" ? values.creator_url : "";
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creator_url: creatorUrl }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "添加失败");
    }
    // 成功后 form-dialog 会 emit 'monitors:changed',CreatorsList 自动 refetch
  }

  async function handleDelete(id: string) {
    if (pendingDeleteId) return;
    if (typeof window !== "undefined" && !window.confirm("确定要删除这个博主吗?")) {
      return;
    }
    setPendingDeleteId(id);
    try {
      const res = await fetch(`/api/creators/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "删除失败");
      }
      emitMonitorsChanged();
    } catch (err) {
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "删除失败");
      }
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleFetch(id: string) {
    if (pendingFetchId) return;
    setPendingFetchId(id);
    try {
      // 走 /api/cron/monitor-creators 真正抓取入库(而非 /api/tasks 的死路径 task)。
      // 注意:cron 端点是批量的,会抓取所有 active 博主;Hobby 无 cron,单卡只是便捷入口。
      // 用 fire-and-forget:抓取入库是异步的,不等返回,提示后延迟 refetch 看新视频。
      void fetch("/api/cron/monitor-creators", { cache: "no-store" }).catch(() => {
        /* swallow — refetch 会反映结果 */
      });
      if (typeof window !== "undefined") {
        window.alert("已触发抓取,后台正在拉取最新视频并自动分析,稍后刷新查看。");
      }
      // 入库 + pipeline 需要几秒到几十秒,延迟两次 refetch 让用户看到进度
      setTimeout(() => void refetch(), 4000);
      setTimeout(() => void refetch(), 10000);
    } finally {
      setPendingFetchId(null);
    }
  }

  const filtered = React.useMemo(() => {
    if (filter === "all") return creators;
    return creators.filter((c) => c.status === filter);
  }, [creators, filter]);

  const hasAny = creators.length > 0;
  const hasMatches = filtered.length > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            {creators.length} 个博主
          </Muted>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            aria-label="按状态筛选"
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 pr-8 text-sm text-zinc-900 transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          添加博主
        </Button>
      </div>

      {/* Grid 或 Empty */}
      {!hasMatches ? (
        <EmptyState
          icon={<Users2 className="h-8 w-8" />}
          title={hasAny ? "没有匹配的博主" : "还没有添加博主"}
          description={
            hasAny
              ? "尝试切换其他状态筛选,或添加新的博主。"
              : "粘贴 TikTok 博主主页 URL,系统会定期抓取新视频并自动分析。"
          }
          action={
            hasAny ? undefined : (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                添加博主
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CreatorCard
              key={c.id}
              creator={c}
              onDelete={handleDelete}
              onFetch={handleFetch}
              deleting={pendingDeleteId === c.id}
              fetching={pendingFetchId === c.id}
            />
          ))}
        </div>
      )}

      {/* 添加 dialog */}
      <MonitorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="添加博主"
        description="粘贴 TikTok 博主主页 URL,系统会定期抓取新视频并自动分析。"
        submitLabel="添加"
        fields={[
          {
            name: "creator_url",
            label: "博主主页 URL",
            placeholder: "https://www.tiktok.com/@username",
            type: "url",
          },
        ]}
        fieldSchemas={{
          creator_url: z
            .string()
            .min(1, "URL 不能为空")
            .url("请输入合法的 URL(以 http/https 开头)"),
        }}
        defaultValues={{ creator_url: "" }}
        onSubmit={handleAdd}
      />
    </div>
  );
}