"use client";

import * as React from "react";
import { Loader2, Plus, Search as SearchIcon, Trash2, Tags, Zap } from "lucide-react";
import { z } from "zod";

import type { KeywordRow } from "@/lib/pipeline/types";
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
import type { FieldValues } from "react-hook-form";

/**
 * 关键词 UI 模块(2 个导出)
 *
 *   KeywordCard  — 单卡片(props:{ keyword, onDelete, onFetch?, deleting?, fetching? })
 *   KeywordsList — 列表管理器(toolbar + 响应式 grid + EmptyState + 添加 dialog)
 *
 * 设计原则(与 creator-card 对齐):
 * - KeywordCard 是纯展示卡,父组件(KeywordsList)拥有全部交互状态
 * - KeywordsList 监听 monitors:changed 事件,自动 refetch
 * - 删除 / 立即搜索用 DELETE /api/keywords/[id] 和 POST /api/tasks(monitor_keyword)
 * - 添加成功后由 MonitorFormDialog 内部 emit 'monitors:changed',KeywordsList 收到后 refetch
 */

// ============================================================
// KeywordCard — 单卡片
//   左:Search icon 占位(zinc-200 圆 + Search icon)
//   中:H3 keyword(2xl font-semibold)+ region/language chip
//   右:fetch_limit + monitor_frequency badge + last_fetch_time + 立即搜索 + 删除
// ============================================================

export interface KeywordCardProps {
  keyword: KeywordRow;
  onDelete: (id: string) => void;
  /** 可选 — 立即搜索回调;不传则按钮 disabled(Phase 3 stub) */
  onFetch?: (id: string) => void;
  /** 当前卡片是否处于删除中(显示 spinner) */
  deleting?: boolean;
  /** 当前卡片是否处于搜索中(显示 spinner) */
  fetching?: boolean;
}

export function KeywordCard({
  keyword,
  onDelete,
  onFetch,
  deleting,
  fetching,
}: KeywordCardProps) {
  const handleDelete = React.useCallback(() => {
    if (deleting) return;
    onDelete(keyword.id);
  }, [keyword.id, onDelete, deleting]);

  const handleFetch = React.useCallback(() => {
    if (fetching || !onFetch) return;
    onFetch(keyword.id);
  }, [keyword.id, onFetch, fetching]);

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-4">
        {/* 左:Search icon 占位 */}
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          <SearchIcon className="h-6 w-6" />
        </div>

        {/* 中:keyword + region/language chip */}
        <div className="min-w-0 flex-1 space-y-2">
          <H3 className="truncate text-2xl font-semibold" title={keyword.keyword}>
            {keyword.keyword}
          </H3>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="font-mono">
              {keyword.region}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {keyword.language}
            </Badge>
          </div>
        </div>

        {/* 右:fetch_limit + meta + 按钮 */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="default" className="font-mono">
            top {keyword.fetch_limit}
          </Badge>
          <Badge variant="secondary">
            {formatMonitorFrequency(keyword.monitor_frequency)}
          </Badge>
          <Muted className="whitespace-nowrap">
            最近搜索:{keyword.last_fetch_time ? new Date(keyword.last_fetch_time).toLocaleDateString("zh-CN") : "—"}
          </Muted>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetch}
              disabled={!onFetch || fetching}
              aria-label={`立即搜索 ${keyword.keyword}`}
            >
              {fetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              立即搜索
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label={`删除 ${keyword.keyword}`}
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
// KeywordsList — 列表管理器
//   toolbar:N 个关键词 + status filter + 添加关键词按钮
//   3 列响应式 grid(grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
//   EmptyState
//   添加 dialog(复用 MonitorFormDialog,fields: keyword / region / language / fetch_limit)
// ============================================================

type StatusFilter = "all" | "active" | "paused" | "pending";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: CRON_STATUS_LABELS.active ?? "运行中" },
  { value: "paused", label: CRON_STATUS_LABELS.paused ?? "已暂停" },
  { value: "pending", label: CRON_STATUS_LABELS.pending ?? "等待中" },
];

export interface KeywordsListProps {
  initialKeywords: KeywordRow[];
}

export function KeywordsList({ initialKeywords }: KeywordsListProps) {
  const [keywords, setKeywords] = React.useState<KeywordRow[]>(initialKeywords);
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
      const res = await fetch("/api/keywords", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { keywords?: KeywordRow[] };
      setKeywords(data.keywords ?? []);
    } catch {
      // 网络错误静默 — 旧数据继续展示
    }
  }

  async function handleAdd(values: FieldValues) {
    const keyword =
      typeof values.keyword === "string" ? values.keyword.trim() : "";
    const region =
      typeof values.region === "string" && values.region.trim().length > 0
        ? values.region.trim()
        : "US";
    const language =
      typeof values.language === "string" && values.language.trim().length > 0
        ? values.language.trim()
        : "en";
    const fetchLimitRaw = values.fetch_limit;
    const fetchLimit =
      typeof fetchLimitRaw === "number"
        ? fetchLimitRaw
        : Number.parseInt(String(fetchLimitRaw ?? ""), 10) || 20;

    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        region,
        language,
        fetch_limit: fetchLimit,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "添加失败");
    }
    // 成功后 form-dialog 会 emit 'monitors:changed',KeywordsList 自动 refetch
  }

  async function handleDelete(id: string) {
    if (pendingDeleteId) return;
    if (typeof window !== "undefined" && !window.confirm("确定要删除这个关键词吗?")) {
      return;
    }
    setPendingDeleteId(id);
    try {
      const res = await fetch(`/api/keywords/${id}`, { method: "DELETE" });
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
      // 走 /api/cron/search-keywords 真正抓取入库(而非 /api/tasks 的死路径 task)。
      // 注意:cron 端点是批量的,会搜索所有 active 关键词;Hobby 无 cron,单卡只是便捷入口。
      // 用 fire-and-forget:抓取入库是异步的,不等返回,提示后延迟 refetch 看新视频。
      void fetch("/api/cron/search-keywords", { cache: "no-store" }).catch(() => {
        /* swallow — refetch 会反映结果 */
      });
      if (typeof window !== "undefined") {
        window.alert("已触发搜索,后台正在拉取搜索结果并自动分析,稍后刷新查看。");
      }
      // 入库 + pipeline 需要几秒到几十秒,延迟两次 refetch 让用户看到进度
      setTimeout(() => void refetch(), 4000);
      setTimeout(() => void refetch(), 10000);
    } finally {
      setPendingFetchId(null);
    }
  }

  const filtered = React.useMemo(() => {
    if (filter === "all") return keywords;
    return keywords.filter((k) => k.status === filter);
  }, [keywords, filter]);

  const hasAny = keywords.length > 0;
  const hasMatches = filtered.length > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Muted className="font-mono uppercase tracking-[0.18em]">
            {keywords.length} 个关键词
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
          添加关键词
        </Button>
      </div>

      {/* Grid 或 Empty */}
      {!hasMatches ? (
        <EmptyState
          icon={<Tags className="h-8 w-8" />}
          title={hasAny ? "没有匹配的关键词" : "还没有添加关键词"}
          description={
            hasAny
              ? "尝试切换其他状态筛选,或添加新的关键词。"
              : "输入 TikTok 搜索关键词,系统会定期抓取 TikTok 搜索结果并批量分析。"
          }
          action={
            hasAny ? undefined : (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                添加关键词
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((k) => (
            <KeywordCard
              key={k.id}
              keyword={k}
              onDelete={handleDelete}
              onFetch={handleFetch}
              deleting={pendingDeleteId === k.id}
              fetching={pendingFetchId === k.id}
            />
          ))}
        </div>
      )}

      {/* 添加 dialog */}
      <MonitorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="添加关键词"
        description="输入 TikTok 搜索关键词,系统会按设置抓取搜索结果并自动分析。"
        submitLabel="添加"
        fields={[
          {
            name: "keyword",
            label: "关键词",
            placeholder: "例如:travel hacks",
            type: "text",
          },
          {
            name: "region",
            label: "地区(ISO 国家码)",
            placeholder: "US",
            type: "text",
            inputClassName: "font-mono",
          },
          {
            name: "language",
            label: "语言(ISO 语言码)",
            placeholder: "en",
            type: "text",
            inputClassName: "font-mono",
          },
          {
            name: "fetch_limit",
            label: "抓取上限(条)",
            placeholder: "20",
            type: "number",
          },
        ]}
        fieldSchemas={{
          keyword: z
            .string()
            .min(1, "关键词不能为空")
            .max(120, "关键词最多 120 个字符"),
          region: z
            .string()
            .max(8, "地区码过长")
            .optional()
            .or(z.literal("")),
          language: z
            .string()
            .max(8, "语言码过长")
            .optional()
            .or(z.literal("")),
          fetch_limit: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce
              .number()
              .int("请输入整数")
              .min(1, "至少 1 条")
              .max(100, "最多 100 条")
              .optional()
          ),
        }}
        defaultValues={{
          keyword: "",
          region: "",
          language: "",
          fetch_limit: 20,
        }}
        onSubmit={handleAdd}
      />
    </div>
  );
}