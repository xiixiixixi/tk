"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Pause, Play, Plus, Tags, Trash2 } from "lucide-react";
import { z } from "zod";

import type { KeywordWithStats } from "@/lib/pipeline/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { H3, Muted } from "@/components/ui/typography";
import { MonitorFormDialog } from "@/components/monitor/form-dialog";
import {
  CRON_STATUS_LABELS,
  emitMonitorsChanged,
  useMonitorEvents,
} from "@/components/monitor/utils";
import { formatCount, formatRelative } from "@/lib/utils";
import type { FieldValues } from "react-hook-form";

/**
 * 关键词 UI 模块(2 个导出)
 *
 *   KeywordCard  — 单卡片(props:{ keyword, onToggleStatus, onDelete, toggling?, deleting? })
 *   KeywordsList — 列表管理器(toolbar + 响应式 grid + EmptyState + 添加 dialog)
 *
 * 设计原则:
 * - KeywordCard 是纯展示卡,父组件(KeywordsList)拥有全部交互状态
 * - 整卡可点击进入 /keywords/[id] 详情(按钮事件 stopPropagation 屏蔽冒泡)
 * - KeywordsList 监听 monitors:changed 事件,自动 refetch
 * - 状态切换 / 删除用 PATCH/DELETE /api/keywords/[id]
 * - 添加成功后由 MonitorFormDialog 内部 emit 'monitors:changed',KeywordsList 收到后 refetch
 */

// ============================================================
// 筛选条件摘要 — 把 KeywordRow 的筛选字段拼成一行 chip
// ============================================================

/**
 * 计算「近 N 天」,published_after(ISO) → "近N天"
 * - 异常日期 / N<=0 → null(不显示)
 * - N>365 → 直接显示日期(避免"近 800 天"这种噪音)
 */
function formatPublishedAfter(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const days = Math.ceil((Date.now() - ms) / 86_400_000);
  if (days <= 0) return null;
  if (days > 365) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  return `近 ${days} 天`;
}

/**
 * 互动率 0-1 → "X%" 字符串
 * - 0 → null(0% 等于没设,避免噪音)
 * - 0-1 之间 → 保留 1 位小数(0.05 → "5%",0.125 → "12.5%")
 */
function formatEngagementRatePercent(rate: number | null): string | null {
  if (rate == null || rate <= 0) return null;
  const pct = rate * 100;
  // 整数时不带小数点
  const text = Number.isInteger(pct) ? `${pct}` : pct.toFixed(1);
  return `互动率≥${text}%`;
}

/**
 * 把 keyword 的筛选字段拼成 chip 列表,空条件会被跳过
 * 按 spec 拼装顺序:播放 / 互动率 / 近 N 天 / 时长 / 仅视频
 */
function buildFilterSummary(keyword: KeywordWithStats): string[] {
  const chips: string[] = [];

  if (keyword.min_play_count != null && keyword.min_play_count > 0) {
    chips.push(`播放≥${formatCount(keyword.min_play_count)}`);
  }
  const engagement = formatEngagementRatePercent(keyword.min_engagement_rate);
  if (engagement) chips.push(engagement);

  const publishedAfter = formatPublishedAfter(keyword.published_after);
  if (publishedAfter) chips.push(publishedAfter);

  if (keyword.min_duration_sec != null && keyword.max_duration_sec != null) {
    chips.push(`${keyword.min_duration_sec}~${keyword.max_duration_sec} 秒`);
  } else if (keyword.min_duration_sec != null) {
    chips.push(`≥${keyword.min_duration_sec} 秒`);
  } else if (keyword.max_duration_sec != null) {
    chips.push(`≤${keyword.max_duration_sec} 秒`);
  }

  if (keyword.exclude_slideshow) {
    chips.push("仅视频");
  }

  return chips;
}

/**
 * 关键词状态 → Badge 视觉变体
 * (与 StatusBadge 风格保持一致,语义不同的关键词 status 不复用 StatusBadge)
 */
function statusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "paused":
      return "secondary";
    default:
      return "outline";
  }
}

// ============================================================
// KeywordCard — 单卡片
//   左:Tags icon 占位
//   中:H3 keyword(2xl) + region/language chip + 筛选条件摘要 + 统计
//   右:top{fetch_limit} badge + 状态 badge + 暂停/启用 + 删除
//   整卡 <Link href="/keywords/[id]">,按钮 stopPropagation 屏蔽冒泡
// ============================================================

export interface KeywordCardProps {
  keyword: KeywordWithStats;
  /** 切换状态(active ↔ paused) */
  onToggleStatus: (id: string, nextStatus: "active" | "paused") => void;
  onDelete: (id: string) => void;
  /** 当前卡片是否处于状态切换中(显示 spinner) */
  toggling?: boolean;
  /** 当前卡片是否处于删除中(显示 spinner) */
  deleting?: boolean;
}

export function KeywordCard({
  keyword,
  onToggleStatus,
  onDelete,
  toggling,
  deleting,
}: KeywordCardProps) {
  const handleToggle = React.useCallback(
    (e: React.MouseEvent) => {
      // 屏蔽 Link 跳转冒泡,按钮独立行为
      e.preventDefault();
      e.stopPropagation();
      if (toggling) return;
      const next: "active" | "paused" =
        keyword.status === "active" ? "paused" : "active";
      onToggleStatus(keyword.id, next);
    },
    [keyword.id, keyword.status, onToggleStatus, toggling]
  );

  const handleDelete = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (deleting) return;
      onDelete(keyword.id);
    },
    [keyword.id, onDelete, deleting]
  );

  const filterChips = React.useMemo(
    () => buildFilterSummary(keyword),
    [keyword]
  );

  const statusLabel =
    CRON_STATUS_LABELS[keyword.status] ?? keyword.status ?? "未知";

  return (
    <Link href={`/keywords/${keyword.id}`} className="group block">
      <Card className="flex flex-col gap-5 p-5 transition-colors group-hover:border-zinc-300 dark:group-hover:border-zinc-700">
        <div className="flex items-start gap-4">
          {/* 左:Tags icon 占位 */}
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          >
            <Tags className="h-6 w-6" />
          </div>

          {/* 中:keyword + region/language chip + 筛选条件摘要 + 统计 */}
          <div className="min-w-0 flex-1 space-y-3">
            <H3
              className="truncate text-2xl font-semibold"
              title={keyword.keyword}
            >
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

            {/* 筛选条件摘要 — 一行 chip,空条件不显示 */}
            {filterChips.length > 0 ? (
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {filterChips.join(" · ")}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-400 dark:text-zinc-600">
                无筛选条件,采集全部搜索结果
              </p>
            )}

            {/* 统计:已采集 / 已解析 / 最近采集 */}
            <Muted className="text-xs">
              已采集 {formatCount(keyword.video_count)} · 已解析{" "}
              {formatCount(keyword.analyzed_count)} · 最近采集{" "}
              {formatRelative(keyword.last_fetch_time)}
            </Muted>
          </div>

          {/* 右:top fetch_limit + 状态 + 操作 */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge variant="default" className="font-mono">
              top {keyword.fetch_limit}
            </Badge>
            <Badge variant={statusBadgeVariant(keyword.status)}>
              {statusLabel}
            </Badge>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggle}
                disabled={toggling}
                aria-label={
                  keyword.status === "active"
                    ? `暂停 ${keyword.keyword}`
                    : `启用 ${keyword.keyword}`
                }
              >
                {toggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : keyword.status === "active" ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {keyword.status === "active" ? "暂停" : "启用"}
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
    </Link>
  );
}

// ============================================================
// KeywordsList — 列表管理器
//   toolbar:N 个关键词 + status filter + 添加关键词按钮
//   3 列响应式 grid(grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
//   EmptyState
//   添加 dialog(复用 MonitorFormDialog,fields: keyword / region / language / fetch_limit
//               + 筛选条件:min_play_count / min_like_count / min_engagement_rate /
//               published_after_days / min_duration_sec / max_duration_sec)
// ============================================================

type StatusFilter = "all" | "active" | "paused" | "pending";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: CRON_STATUS_LABELS.active ?? "运行中" },
  { value: "paused", label: CRON_STATUS_LABELS.paused ?? "已暂停" },
  { value: "pending", label: CRON_STATUS_LABELS.pending ?? "等待中" },
];

// 空字符串 / NaN → undefined(让 API 收到的是 undefined,而不是 "" 或 NaN)
function optionalInt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export interface KeywordsListProps {
  initialKeywords: KeywordWithStats[];
}

export function KeywordsList({ initialKeywords }: KeywordsListProps) {
  const [keywords, setKeywords] =
    React.useState<KeywordWithStats[]>(initialKeywords);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  );
  const [pendingToggleId, setPendingToggleId] = React.useState<string | null>(
    null
  );

  // 监听 monitors:changed → 重新拉列表
  // (添加成功由 MonitorFormDialog 内部 emit,删除/状态切换由 handleDelete / handleToggleStatus 显式 emit)
  useMonitorEvents(() => {
    void refetch();
  });

  async function refetch() {
    try {
      const res = await fetch("/api/keywords", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { keywords?: KeywordWithStats[] };
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
    const fetchLimit = optionalInt(values.fetch_limit) ?? 20;

    // 筛选字段组装 — 空值不传,让 DB / API 走默认
    const minPlayCount = optionalInt(values.min_play_count);
    const minLikeCount = optionalInt(values.min_like_count);
    // 互动率:UI 收的是百分比(如 5),提交时 ÷100 转成 0-1
    const engagementPct = optionalInt(values.min_engagement_rate);
    const minEngagementRate =
      engagementPct !== undefined ? engagementPct / 100 : undefined;
    // published_after:UI 收「近 N 天」,提交时换算成 ISO
    const days = optionalInt(values.published_after_days);
    const publishedAfter =
      days !== undefined && days > 0
        ? new Date(Date.now() - days * 86_400_000).toISOString()
        : undefined;
    const minDurationSec = optionalInt(values.min_duration_sec);
    const maxDurationSec = optionalInt(values.max_duration_sec);

    const body: Record<string, unknown> = {
      keyword,
      region,
      language,
      fetch_limit: fetchLimit,
    };
    if (minPlayCount !== undefined) body.min_play_count = minPlayCount;
    if (minLikeCount !== undefined) body.min_like_count = minLikeCount;
    if (minEngagementRate !== undefined) {
      body.min_engagement_rate = minEngagementRate;
    }
    if (publishedAfter !== undefined) body.published_after = publishedAfter;
    if (minDurationSec !== undefined) body.min_duration_sec = minDurationSec;
    if (maxDurationSec !== undefined) body.max_duration_sec = maxDurationSec;
    // 仅视频(spec 决定固定为 true,不在 UI 暴露)
    body.exclude_slideshow = true;

    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "添加失败");
    }
    // 成功后 form-dialog 会 emit 'monitors:changed',KeywordsList 自动 refetch
  }

  async function handleDelete(id: string) {
    if (pendingDeleteId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("确定要删除这个关键词吗?")
    ) {
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

  async function handleToggleStatus(
    id: string,
    nextStatus: "active" | "paused"
  ) {
    if (pendingToggleId) return;
    setPendingToggleId(id);
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "状态切换失败");
      }
      // 乐观更新:直接改本地状态,免一次 refetch 的延迟
      setKeywords((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: nextStatus } : k))
      );
      emitMonitorsChanged();
    } catch (err) {
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "状态切换失败");
      }
    } finally {
      setPendingToggleId(null);
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
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              toggling={pendingToggleId === k.id}
              deleting={pendingDeleteId === k.id}
            />
          ))}
        </div>
      )}

      {/* 添加 dialog — 基础字段 + 采集筛选条件 */}
      <MonitorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="添加关键词"
        description="输入 TikTok 搜索关键词与采集筛选条件,系统会定期抓取并自动分析。"
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
          {
            name: "min_play_count",
            label: "最低播放量",
            placeholder: "例如 10000",
            type: "number",
          },
          {
            name: "min_like_count",
            label: "最低点赞数",
            placeholder: "例如 500",
            type: "number",
          },
          {
            name: "min_engagement_rate",
            label: "最低互动率(%)",
            placeholder: "例如 5 表示 5%",
            type: "number",
          },
          {
            name: "published_after_days",
            label: "仅采集近 N 天发布",
            placeholder: "例如 7 表示近 7 天",
            type: "number",
          },
          {
            name: "min_duration_sec",
            label: "最短时长(秒)",
            placeholder: "例如 15",
            type: "number",
          },
          {
            name: "max_duration_sec",
            label: "最长时长(秒)",
            placeholder: "例如 60",
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
          min_play_count: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().int().min(0).optional()
          ),
          min_like_count: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().int().min(0).optional()
          ),
          min_engagement_rate: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().min(0).max(100).optional()
          ),
          published_after_days: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().int().min(1).max(365).optional()
          ),
          min_duration_sec: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().int().min(0).optional()
          ),
          max_duration_sec: z.preprocess(
            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
            z.coerce.number().int().min(0).optional()
          ),
        }}
        defaultValues={{
          keyword: "",
          region: "",
          language: "",
          fetch_limit: 20,
          min_play_count: undefined,
          min_like_count: undefined,
          min_engagement_rate: undefined,
          published_after_days: undefined,
          min_duration_sec: undefined,
          max_duration_sec: undefined,
        }}
        onSubmit={handleAdd}
      />
    </div>
  );
}