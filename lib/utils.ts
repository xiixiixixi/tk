import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TERMINAL_STATUSES } from "@/types";

/**
 * shadcn/ui 风格的 className 合并工具:
 * 1. clsx 处理条件类名
 * 2. tailwind-merge 处理 Tailwind 类名冲突(后者覆盖前者)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * TikTok URL 校验 — 支持标准、短链、分享 3 种形式
 *   https://www.tiktok.com/@user/video/1234567890  ← 标准
 *   https://vm.tiktok.com/xxxxxxxxxx              ← 短链
 *   https://www.tiktok.com/t/xxxxxxxxxx           ← 分享链
 *
 * 不验证视频是否存在(那要发起请求),只验证 URL 格式合法。
 */
const TIKTOK_URL_PATTERN =
  /^https?:\/\/(?:[a-z]{2}\.)?(?:www\.|m\.|vm\.)?tiktok\.com\/((?:@[\w._-]+\/video\/\d+)|(?:t\/[\w-]+))\/?$/i;

export function isValidTikTokUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return false; // 长度上限防 DoS
  return TIKTOK_URL_PATTERN.test(trimmed);
}

/**
 * 从 TikTok URL 提取视频 ID(标准形式)
 * 返回 null 表示不是标准形式(短链 / 分享链需要先展开)
 */
export function extractTikTokVideoId(url: string): string | null {
  if (typeof url !== "string") return null;
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * 检测 URL 形式,返回判断结果
 */
export type TikTokUrlKind = "standard" | "short" | "share" | null;

export function classifyTikTokUrl(url: string): TikTokUrlKind {
  if (!isValidTikTokUrl(url)) return null;
  if (/\/video\//.test(url)) return "standard";
  if (/^https?:\/\/vm\.tiktok\.com\//.test(url)) return "short";
  return "share";
}

// ============================================================
// 通用格式化(集中到这里,避免组件各自重复)
// ============================================================

/**
 * 字符串截断 + 省略号
 * - null / undefined → "—"
 * - max 包含末尾 "…" 字符
 */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * ISO 时间字符串 → "2026-07-04 03:14"
 * 用本地时区(浏览器默认)
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * ISO 时间字符串 → 相对时间("刚刚" / "3 分钟前" / "5 天前" / "2 个月前" / "1 年前")
 * - null / undefined → "—"
 * - 非法时间 → "—"
 */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return "刚刚"; // 未来时间(系统时钟漂移)保护
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  const diffMon = Math.round(diffDay / 30);
  if (diffMon < 12) return `${diffMon} 个月前`;
  return `${Math.round(diffMon / 12)} 年前`;
}

/**
 * 判断 analysis_status 是否为终态(completed / failed / duplicate)
 * 中央化以便所有轮询点统一使用
 */
export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as ReadonlyArray<string>).includes(status);
}

/**
 * 大数字格式化 "1.2万" / "123.4万" / "1.5亿"
 */
export function formatCount(count: number): string {
  if (count < 10000) return count.toString();
  if (count < 1_0000_0000) return `${(count / 10000).toFixed(1)}万`;
  return `${(count / 1_0000_0000).toFixed(1)}亿`;
}

/**
 * 视频时长格式化 "23 秒" / "1 分 23 秒"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} 分` : `${m} 分 ${s} 秒`;
}
