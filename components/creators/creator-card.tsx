"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Pause, Play, Plus, Trash2, User, Users2 } from "lucide-react";
import { z } from "zod";
import type { FieldValues } from "react-hook-form";

import type { CreatorWithStats } from "@/lib/pipeline/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { H3, Muted } from "@/components/ui/typography";
import { MonitorFormDialog } from "@/components/monitor/form-dialog";
import {
  CRON_STATUS_LABELS,
  emitMonitorsChanged,
  formatCronStatus,
  useMonitorEvents,
} from "@/components/monitor/utils";
import { formatRelative } from "@/lib/utils";

/**
 * 博主 UI 模块(2 个导出)
 *
 *   CreatorCard  — 单卡片(props:{ creator, onToggleStatus, onDelete, toggling?, deleting? })
 *   CreatorsList — 列表管理器(toolbar + 响应式 grid + EmptyState + 添加 dialog)
 *
 * 设计原则:
 * - CreatorCard 是纯展示卡,父组件(CreatorsList)拥有全部交互状态
 * - 整卡可点击进入 /creators/[id](stretched-link 模式:Link 绝对定位覆盖,操作按钮 sibling 抬 z 抢占)
 * - 暂停/启用 调 PATCH /api/creators/[id] {status},删除调 DELETE
 * - CreatorsList 监听 monitors:changed 事件,自动 refetch
 *
 * 添加博主时 POST 已 fire-and-forget 触发 monitor-creators,
 * 不再需要「立即抓取」按钮(Railway cron 兜底)
 */

// ============================================================
// CreatorCard — 单卡片
//   左:Avatar 占位(zinc-200 圆 + User icon)
//   中-上:@creator_name + category
//   中-下:4 项统计(已采集 / 已解析 / 最近采集 / 上次新增)
//   右-上:状态 badge(运行中 / 已暂停)
//   右-下:【暂停/启用】切换 + 【删除】
//   整卡 stretched-link 进入 /creators/[id]
// ============================================================

export interface CreatorCardProps {
  creator: CreatorWithStats;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDelete: (id: string) => void;
  /** 当前卡片是否处于暂停/启用切换中(显示 spinner) */
  toggling?: boolean;
  /** 当前卡片是否处于删除中(显示 spinner) */
  deleting?: boolean;
}

export function CreatorCard({
  creator,
  onToggleStatus,
  onDelete,
  toggling,
  deleting,
}: CreatorCardProps) {
  const isActive = creator.status === "active";

  // 按钮必须在 stretched-link 上层,preventDefault+stopPropagation 双保险
  const handleToggle = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (toggling) return;
      onToggleStatus(creator.id, creator.status);
    },
    [creator.id, creator.status, onToggleStatus, toggling]
  );

  const handleDelete = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (deleting) return;
      onDelete(creator.id);
    },
    [creator.id, onDelete, deleting]
  );

  return (
    <Card className="relative flex flex-col gap-5 p-5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
      {/* 整卡点击区 — stretched link 覆盖除按钮以外的区域 */}
      <Link
        href={`/creators/${creator.id}`}
        aria-label={`查看 ${creator.creator_name ?? creator.creator_url} 详情`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
      />

      {/* 上:avatar + 名字 + 分类 + 状态 badge */}
      <div className="relative pointer-events-none flex items-start gap-4">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          <User className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <H3 className="truncate text-base" title={creator.creator_name ?? creator.creator_url}>
            @{creator.creator_name ?? "unknown"}
          </H3>
          {creator.category ? (
            <Muted className="truncate">{creator.category}</Muted>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0">
          {formatCronStatus(creator.status)}
        </Badge>
      </div>

      {/* 中:统计区 — 2×2 grid(divider 之上) */}
      <div className="relative pointer-events-none grid grid-cols-2 gap-x-5 gap-y-2 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800">
        <Stat label="已采集" value={`${creator.video_count} 条`} />
        <Stat label="已解析" value={`${creator.analyzed_count} 条`} />
        <Stat label="最近采集" value={formatRelative(creator.last_fetch_time)} />
        <Stat label="上次新增" value={`${creator.last_fetch_video_count} 条`} />
      </div>

      {/* 下:操作按钮(z-20 高于 Link overlay,z-10) */}
      <div className="relative flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={toggling || deleting}
          aria-label={
            isActive
              ? `暂停 ${creator.creator_name ?? creator.creator_url}`
              : `启用 ${creator.creator_name ?? creator.creator_url}`
          }
        >
          {toggling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isActive ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {isActive ? "暂停" : "启用"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting || toggling}
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
    </Card>
  );
}

/** 统计区单行(左标签 + 右值) */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <Muted className="text-xs">{label}</Muted>
      <span className="font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// CreatorsList — 列表管理器
//   toolbar:N 个博主 + status filter + 添加博主按钮
//   3 列响应式 grid(grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
//   EmptyState
//   添加 dialog(复用 MonitorFormDialog,只有 creator_url 一项;支持 @username / username / URL)
// ============================================================

type StatusFilter = "all" | "active" | "paused" | "pending";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: CRON_STATUS_LABELS.active ?? "运行中" },
  { value: "paused", label: CRON_STATUS_LABELS.paused ?? "已暂停" },
  { value: "pending", label: CRON_STATUS_LABELS.pending ?? "等待中" },
];

export interface CreatorsListProps {
  initialCreators: CreatorWithStats[];
}

export function CreatorsList({ initialCreators }: CreatorsListProps) {
  const [creators, setCreators] = React.useState<CreatorWithStats[]>(initialCreators);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [pendingToggleId, setPendingToggleId] = React.useState<string | null>(null);

  // 监听 monitors:changed → 重新拉列表
  // (添加成功由 MonitorFormDialog 内部 emit,删除/切换成功由 handleDelete/handleToggleStatus 显式 emit)
  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch("/api/creators", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { creators?: CreatorWithStats[] };
      setCreators(data.creators ?? []);
    } catch {
      // 网络错误静默 — 旧数据继续展示
    }
  }, []);

  useMonitorEvents(() => {
    void refetch();
  });

  async function handleAdd(values: FieldValues) {
    const creatorUrl =
      typeof values.creator_url === "string" ? values.creator_url.trim() : "";
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
    if (pendingDeleteId || pendingToggleId) return;
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

  async function handleToggleStatus(id: string, currentStatus: string) {
    if (pendingDeleteId || pendingToggleId) return;
    const next = currentStatus === "active" ? "paused" : "active";
    setPendingToggleId(id);
    try {
      const res = await fetch(`/api/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "切换状态失败");
      }
      // 本地乐观更新,避免等下一次 refetch 的视觉延迟
      setCreators((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: next } : c))
      );
      emitMonitorsChanged();
    } catch (err) {
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "切换状态失败");
      }
    } finally {
      setPendingToggleId(null);
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
              : "粘贴 TikTok 博主主页 URL、@用户名 或直接输入用户名,系统会定期抓取新视频并自动分析。"
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
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              toggling={pendingToggleId === c.id}
              deleting={pendingDeleteId === c.id}
            />
          ))}
        </div>
      )}

      {/* 添加 dialog — 支持 @username、username、URL 三种形式 */}
      <MonitorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="添加博主"
        description="支持 @用户名、用户名 或 TikTok 博主主页 URL。"
        submitLabel="添加"
        fields={[
          {
            name: "creator_url",
            label: "博主标识",
            placeholder: "@username 或 https://www.tiktok.com/@username",
            type: "text",
          },
        ]}
        fieldSchemas={{
          creator_url: z
            .string()
            .min(1, "不能为空")
            .refine((v) => {
              const t = v.trim();
              if (t.length === 0) return false;
              if (/^https?:\/\//i.test(t)) return true; // URL
              if (/^@?[\w._-]+$/.test(t)) return true; // @username / 纯 username
              return false;
            }, "请输入 @用户名、用户名 或 TikTok URL"),
        }}
        defaultValues={{ creator_url: "" }}
        onSubmit={handleAdd}
      />
    </div>
  );
}
