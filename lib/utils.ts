import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
