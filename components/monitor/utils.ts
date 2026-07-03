"use client";

import * as React from "react";

/**
 * 监控目标共享工具(creator + keyword 共用)
 *
 * 字段语义来源:docs/tech.md §4.6 creators / §4.7 keywords
 *   monitor_frequency TEXT — "daily" / "weekly" / "12h" / "6h" ...
 *   status            TEXT — "active" / "paused" / "pending"
 */

/**
 * 监控频率 → 中文 label
 * 支持 3 种输入:
 *   1) 命名值: hourly / daily / weekly / monthly
 *   2) 间隔值: "12h" / "6h" / "2d" / "30m" (cron-style 短写)
 *   3) 兜底: 任何无法识别的字符串直接原样返回
 */
export function formatMonitorFrequency(freq: string | null | undefined): string {
  if (!freq) return "—";
  const v = freq.trim().toLowerCase();
  if (!v) return "—";

  switch (v) {
    case "hourly":
      return "每 1 小时";
    case "daily":
      return "每 1 天";
    case "weekly":
      return "每周";
    case "monthly":
      return "每月";
  }

  // 间隔短写: "<n>h" / "<n>d" / "<n>m"
  const m = v.match(/^(\d+)\s*([hm])$/);
  if (m) {
    const n = m[1];
    const unit = m[2] === "h" ? "小时" : m[2] === "d" ? "天" : "分钟";
    return `每 ${n} ${unit}`;
  }

  return freq;
}

/**
 * 监控状态(active / paused / pending)→ 中文 label
 * creators.status / keywords.status 统一使用
 */
export const CRON_STATUS_LABELS: Record<string, string> = {
  active: "运行中",
  paused: "已暂停",
  pending: "等待中",
};

export function formatCronStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return CRON_STATUS_LABELS[status] ?? status;
}

/**
 * 事件名常量 — 监控列表统一监听此事件触发 refetch
 * 触发方:form-dialog 提交成功后,以及外部直接修改数据后
 */
export const MONITORS_CHANGED_EVENT = "monitors:changed";

/**
 * 主动广播"监控数据有变"(供调用方在 mutate 后通知列表 refetch)
 */
export function emitMonitorsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MONITORS_CHANGED_EVENT));
}

/**
 * 监听 'monitors:changed' window 事件
 * - 组件 mount 时订阅,unmount 时自动解绑
 * - handler 用 useCallback 包一下避免频繁重绑
 */
export function useMonitorEvents(handler: () => void): void {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    function onChanged() {
      ref.current();
    }
    window.addEventListener(MONITORS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(MONITORS_CHANGED_EVENT, onChanged);
    };
  }, []);
}
