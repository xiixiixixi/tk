"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ANALYSIS_STATUSES, STATUS_LABELS, type AnalysisStatus } from "@/types";

/**
 * 状态筛选下拉 — Editorial 风格:
 * - 原生 <select>(更轻量,无 popover,更符合"杂志克制"调性)
 * - 边框 + neutral 中性色,与 StatusBadge 风格一致
 * - 父组件完全 controlled,只暴露 value + onChange
 */

export type StatusFilterValue = AnalysisStatus | "all";

interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  className?: string;
  /** 给屏幕阅读器用的 label,默认"按状态筛选" */
  ariaLabel?: string;
  disabled?: boolean;
}

export function StatusFilter({
  value,
  onChange,
  className,
  ariaLabel = "按状态筛选",
  disabled = false,
}: StatusFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as StatusFilterValue)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-9  border border-neutral-200 bg-white px-3 pr-8 text-sm text-neutral-900 transition-colors",
        "focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:ring-offset-0",
        "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-600 dark:focus:ring-neutral-800",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <option value="all">全部状态</option>
      {ANALYSIS_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
