"use client";

import * as React from "react";
import { Search as SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { StatusFilter, type StatusFilterValue } from "./status-filter";

/**
 * 通用视频列表筛选栏(视频库 / 博主详情 / 关键词详情 三处共用)
 *
 * 需求:「凡是列表都有这些筛选设置」——搜索 + 状态 + 播放/点赞门槛 + 发布时间 + 时长 + 排序。
 * 完全 controlled:父组件持有 VideoFilters 状态,本组件只渲染 + onChange。
 */

export interface VideoFilters {
  search: string;
  status: StatusFilterValue;
  minPlayCount: number | null;
  minLikeCount: number | null;
  publishedAfter: string | null; // ISO date (yyyy-mm-dd)
  minDurationSec: number | null;
  maxDurationSec: number | null;
  sortBy: "created_at" | "play_count" | "like_count";
  sortDir: "asc" | "desc";
}

export const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  search: "",
  status: "all",
  minPlayCount: null,
  minLikeCount: null,
  publishedAfter: null,
  minDurationSec: null,
  maxDurationSec: null,
  sortBy: "created_at",
  sortDir: "desc",
};

/** 把 VideoFilters 转成 /api/videos 的 query 参数(只带非空项) */
export function videoFiltersToParams(f: VideoFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.status !== "all") p.set("status", f.status);
  if (f.minPlayCount != null) p.set("minPlayCount", String(f.minPlayCount));
  if (f.minLikeCount != null) p.set("minLikeCount", String(f.minLikeCount));
  if (f.publishedAfter) p.set("publishedAfter", f.publishedAfter);
  if (f.minDurationSec != null) p.set("minDurationSec", String(f.minDurationSec));
  if (f.maxDurationSec != null) p.set("maxDurationSec", String(f.maxDurationSec));
  p.set("sortBy", f.sortBy);
  p.set("sortDir", f.sortDir);
  return p;
}

const inputCls =
  "h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800";

interface ListFiltersProps {
  value: VideoFilters;
  onChange: (next: VideoFilters) => void;
  disabled?: boolean;
  /** 隐藏状态筛选(某些页面不需要) */
  hideStatus?: boolean;
  className?: string;
}

/** 数字输入:空串 → null */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function ListFilters({
  value,
  onChange,
  disabled = false,
  hideStatus = false,
  className,
}: ListFiltersProps) {
  const set = <K extends keyof VideoFilters>(key: K, v: VideoFilters[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {/* 搜索 */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          disabled={disabled}
          placeholder="搜索标题 / 作者"
          aria-label="搜索标题或作者"
          className={cn(inputCls, "w-[180px] pl-8")}
        />
      </div>

      {!hideStatus && (
        <StatusFilter
          value={value.status}
          onChange={(v) => set("status", v)}
          disabled={disabled}
        />
      )}

      {/* 最低播放 */}
      <input
        type="number"
        min={0}
        value={value.minPlayCount ?? ""}
        onChange={(e) => set("minPlayCount", numOrNull(e.target.value))}
        disabled={disabled}
        placeholder="最低播放"
        aria-label="最低播放量"
        className={cn(inputCls, "w-[104px]")}
      />

      {/* 最低点赞 */}
      <input
        type="number"
        min={0}
        value={value.minLikeCount ?? ""}
        onChange={(e) => set("minLikeCount", numOrNull(e.target.value))}
        disabled={disabled}
        placeholder="最低点赞"
        aria-label="最低点赞数"
        className={cn(inputCls, "w-[104px]")}
      />

      {/* 发布时间起 */}
      <input
        type="date"
        value={value.publishedAfter ?? ""}
        onChange={(e) => set("publishedAfter", e.target.value || null)}
        disabled={disabled}
        aria-label="发布时间不早于"
        className={cn(inputCls, "w-[150px]")}
      />

      {/* 时长范围(秒) */}
      <input
        type="number"
        min={0}
        value={value.minDurationSec ?? ""}
        onChange={(e) => set("minDurationSec", numOrNull(e.target.value))}
        disabled={disabled}
        placeholder="时长≥秒"
        aria-label="最短时长秒"
        className={cn(inputCls, "w-[92px]")}
      />
      <input
        type="number"
        min={0}
        value={value.maxDurationSec ?? ""}
        onChange={(e) => set("maxDurationSec", numOrNull(e.target.value))}
        disabled={disabled}
        placeholder="时长≤秒"
        aria-label="最长时长秒"
        className={cn(inputCls, "w-[92px]")}
      />

      {/* 排序 */}
      <select
        value={`${value.sortBy}:${value.sortDir}`}
        onChange={(e) => {
          const [sortBy, sortDir] = e.target.value.split(":") as [
            VideoFilters["sortBy"],
            VideoFilters["sortDir"],
          ];
          onChange({ ...value, sortBy, sortDir });
        }}
        disabled={disabled}
        aria-label="排序"
        className={cn(inputCls, "pr-8")}
      >
        <option value="created_at:desc">最新采集</option>
        <option value="created_at:asc">最早采集</option>
        <option value="play_count:desc">播放最高</option>
        <option value="like_count:desc">点赞最高</option>
      </select>
    </div>
  );
}
